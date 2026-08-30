import { useRouter } from 'expo-router';
import { BookHeadphones, ChevronLeft, ChevronRight, Headphones } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StoryLibraryItem } from '@/core/contracts';
import { authedSource } from '@/features/story/StoryReader';
import { useGetStoryLibraryQuery } from '@/features/story/storyApi';
import { Card } from '@/ui/primitives/Card';
import { Text } from '@/ui/primitives/Text';
import { useTheme } from '@/ui/theme/ThemeProvider';

/**
 * Every published story, free to any signed-in child.
 *
 * The one content surface that does not depend on owning a course: a family
 * with no purchase at all still has something to read here. A story bought
 * inside a course is opened from the course outline instead, so it is reached
 * two ways and listed once.
 */
export default function StoryLibraryScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: stories, isLoading, error } = useGetStoryLibraryQuery();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.background }}
      contentContainerStyle={{
        padding: t.spacing.xl,
        paddingTop: insets.top + t.spacing.md,
        paddingBottom: insets.bottom + t.spacing.xxl,
      }}
    >
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: t.spacing.lg }}
      >
        <ChevronLeft size={20} color={t.colors.mutedForeground} />
        <Text variant="label" color="mutedForeground">
          Back
        </Text>
      </Pressable>

      <Text variant="title">Story Library</Text>
      <Text variant="body" color="mutedForeground" style={{ marginTop: t.spacing.xs }}>
        Narrated stories you can listen along with.
      </Text>
      <View style={{ height: t.spacing.xl }} />

      {isLoading ? (
        <ActivityIndicator color={t.colors.primary} />
      ) : error ? (
        <Card>
          <Text variant="body" color="mutedForeground">
            The story library could not be loaded. Please try again in a moment.
          </Text>
        </Card>
      ) : !stories || stories.length === 0 ? (
        <Card>
          <Text variant="body" color="mutedForeground">
            No stories published yet. New ones appear here once they have been narrated.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: t.spacing.md }}>
          {stories.map((story) => (
            <StoryCard key={story.id} story={story} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function StoryCard({ story }: { story: StoryLibraryItem }) {
  const t = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Read ${story.title}`}
      onPress={() =>
        router.push({ pathname: '/story-library/[storyId]', params: { storyId: story.id } })
      }
    >
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
          {story.coverUrl ? (
            <Image
              source={authedSource(story.coverUrl)}
              accessibilityLabel=""
              resizeMode="cover"
              style={{
                width: 56,
                height: 56,
                borderRadius: t.radius.md,
                backgroundColor: t.colors.muted,
              }}
            />
          ) : (
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: t.radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: t.colors.accent,
              }}
            >
              <BookHeadphones size={24} color={t.colors.primary} />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text variant="label">{story.title}</Text>
            {story.synopsis ? (
              <Text
                variant="caption"
                color="mutedForeground"
                numberOfLines={2}
                style={{ marginTop: 2 }}
              >
                {story.synopsis}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.spacing.xs,
                marginTop: t.spacing.xs,
              }}
            >
              <Headphones size={12} color={t.colors.mutedForeground} />
              <Text variant="caption" color="mutedForeground">
                {story.pageCount} {story.pageCount === 1 ? 'part' : 'parts'}
              </Text>
            </View>
          </View>

          <ChevronRight size={18} color={t.colors.mutedForeground} />
        </View>
      </Card>
    </Pressable>
  );
}
