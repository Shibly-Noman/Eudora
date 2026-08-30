import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ChevronLeft, ChevronRight, Pause, Volume2 } from 'lucide-react-native';
import React from 'react';
import { Image, Pressable, View } from 'react-native';

import { API_BASE_URL } from '@/core/api/baseQuery';
import { getAccessToken } from '@/core/api/tokenStore';
import type { Story, StorySegment } from '@/core/contracts';
import { Text } from '@/ui/primitives/Text';
import { useTheme } from '@/ui/theme/ThemeProvider';

/**
 * Media sits behind the API's own routes, which recheck entitlement on every
 * request, so a bare URL 401s. Both the audio player and <Image> have to carry
 * the bearer token themselves — RTK Query's prepareHeaders only covers what it
 * fetches, and this is fetched by the native player.
 */
export function authedSource(path: string) {
  const token = getAccessToken();
  return {
    uri: `${API_BASE_URL}${path}`,
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  };
}

interface StoryReaderProps {
  story: Story;
  /**
   * Rendered under the pager on the last page. The course surface puts its
   * "I finished this story" button here; the library has no ModuleItem to mark
   * done and passes nothing.
   */
  finishSlot?: React.ReactNode;
}

/**
 * The reading and listening experience, shared by both places a story is
 * opened: a course item and the standalone library.
 *
 * Paged by segment rather than by chapter, because a segment is the unit
 * narration was recorded against — one page is exactly one audio file.
 * Chapters survive only as a heading, which is how the web reader treats them
 * too: a child turns pages, not chapters.
 */
export function StoryReader({ story, finishSlot }: StoryReaderProps) {
  const t = useTheme();
  const [page, setPage] = React.useState(0);

  /** Flattened, because a child turns pages rather than chapters. */
  const pages = React.useMemo(
    () =>
      story.chapters.flatMap((chapter) =>
        chapter.segments.map((segment) => ({ chapter, segment })),
      ),
    [story],
  );

  const current = pages[page];
  const narrationPath = current?.segment.narrationUrl ?? null;

  // Re-created whenever the path changes, which is what swaps the track on a
  // page turn. `null` releases the player on a page with no recording.
  const source = React.useMemo(
    () => (narrationPath ? authedSource(narrationPath) : null),
    [narrationPath],
  );
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  // Leaving the screen must not leave the last page still talking.
  React.useEffect(() => {
    return () => {
      try {
        player.pause();
      } catch {
        // The player may already be released; nothing to stop.
      }
    };
  }, [player]);

  if (pages.length === 0 || !current) {
    return (
      <Text variant="body" style={{ color: t.colors.mutedForeground }}>
        This story has no pages yet.
      </Text>
    );
  }

  const isLast = page === pages.length - 1;

  const togglePlay = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    // Replay from the top once a page has finished, rather than no-opping on a
    // player parked at its own end.
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) {
      player.seekTo(0);
    }
    player.play();
  };

  return (
    <View>
      <Text variant="heading">{story.title}</Text>
      {current.chapter.title ? (
        <Text variant="caption" style={{ color: t.colors.mutedForeground, marginTop: t.spacing.xs }}>
          {current.chapter.title}
        </Text>
      ) : null}

      <Text variant="caption" style={{ color: t.colors.mutedForeground, marginTop: t.spacing.xs }}>
        {page + 1} / {pages.length}
      </Text>

      <SegmentArtwork segment={current.segment} />

      <Text variant="body" style={{ marginTop: t.spacing.lg, lineHeight: 26 }}>
        {current.segment.text}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          marginTop: t.spacing.xl,
        }}
      >
        <PagerButton
          label="Back"
          icon={<ChevronLeft size={18} color={t.colors.foreground} />}
          disabled={page === 0}
          onPress={() => setPage((p) => Math.max(0, p - 1))}
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Pause narration' : 'Read this page to me'}
          onPress={togglePlay}
          disabled={!narrationPath}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: t.spacing.sm,
            paddingVertical: t.spacing.md,
            borderRadius: t.radius.lg,
            opacity: narrationPath ? 1 : 0.4,
            backgroundColor: t.colors.primary,
          }}
        >
          {status.playing ? (
            <Pause size={18} color={t.colors.primaryForeground} />
          ) : (
            <Volume2 size={18} color={t.colors.primaryForeground} />
          )}
          <Text variant="label" style={{ color: t.colors.primaryForeground }}>
            {narrationPath ? (status.playing ? 'Pause' : 'Read to me') : 'No narration'}
          </Text>
        </Pressable>

        <PagerButton
          label="Next"
          icon={<ChevronRight size={18} color={t.colors.foreground} />}
          disabled={isLast}
          onPress={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
        />
      </View>

      {isLast && finishSlot ? (
        <>
          <View style={{ height: t.spacing.xl }} />
          {finishSlot}
        </>
      ) : null}
    </View>
  );
}

function SegmentArtwork({ segment }: { segment: StorySegment }) {
  const t = useTheme();
  const art = segment.assets[0];
  if (!art) return null;

  return (
    <Image
      source={authedSource(art.url)}
      accessibilityLabel={art.altText || undefined}
      resizeMode="cover"
      style={{
        width: '100%',
        height: 200,
        borderRadius: t.radius.lg,
        marginTop: t.spacing.lg,
        backgroundColor: t.colors.muted,
      }}
    />
  );
}

function PagerButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingVertical: t.spacing.md,
        paddingHorizontal: t.spacing.lg,
        borderRadius: t.radius.lg,
        borderWidth: 1,
        borderColor: t.colors.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {icon}
    </Pressable>
  );
}
