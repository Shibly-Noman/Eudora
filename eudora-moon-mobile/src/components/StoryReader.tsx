import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React from 'react';
import { ImageBackground, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ProgressBar, Surface, TouchableRipple } from 'react-native-paper';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMediaSource, type NarrationTimings, type Story } from '@/api';
import { moon } from '@/theme';

type StoryPage = { chapter: Story['chapters'][number]; segment: Story['chapters'][number]['segments'][number] };

// expo-audio creates an HTMLAudioElement as soon as its hook is called. A
// protected narration URL is fetched into a blob asynchronously on web, so a
// valid silent source prevents the interim element from raising
// "The element has no supported sources" before that blob is ready.
const WEB_SILENT_AUDIO = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export function StoryReader({ story, token, initialPage = 0, onExit }: { story: Story; token: string; initialPage?: number; onExit: () => void }) {
  const pages = React.useMemo<StoryPage[]>(
    () => story.chapters.flatMap((chapter) => chapter.segments.map((segment) => ({ chapter, segment }))),
    [story],
  );
  const [page, setPage] = React.useState(() => Math.min(Math.max(initialPage, 0), Math.max(pages.length - 1, 0)));
  const pendingSeek = React.useRef<number | null>(null);
  const resumeAfterSceneChange = React.useRef(false);
  const insets = useSafeAreaInsets();
  const current = pages[page];
  const narrationUrl = current?.segment.narrationUrl ?? null;
  const background = current?.segment.assets.find((asset) => asset.kind === 'BACKGROUND')
    ?? current?.segment.assets.find((asset) => asset.kind === 'ILLUSTRATION')
    ?? current?.segment.assets[0]
    ?? story.cover;
  const source = useMediaSource(narrationUrl, token);
  const backgroundSource = useMediaSource(background?.url, token);
  const fallbackAudioSource = React.useMemo(() => (Platform.OS === 'web' ? { uri: WEB_SILENT_AUDIO } : undefined), []);
  const player = useAudioPlayer(source ?? fallbackAudioSource, { updateInterval: 50 });
  const status = useAudioPlayerStatus(player);
  const narrationReady = Boolean(source) && source?.sourcePath === narrationUrl && !status.error;
  const sectionDurations = React.useMemo(() => pages.map(({ segment }) => narrationDuration(segment)), [pages]);
  const completedDuration = React.useMemo(() => sectionDurations.slice(0, page).reduce((sum, duration) => sum + duration, 0), [page, sectionDurations]);
  const storyDuration = React.useMemo(() => sectionDurations.reduce((sum, duration) => sum + duration, 0), [sectionDurations]);
  const currentTime = Number.isFinite(status.currentTime) ? status.currentTime : 0;
  const storyProgress = storyDuration > 0 ? Math.min((completedDuration + Math.min(currentTime, sectionDurations[page] ?? 0)) / storyDuration, 1) : 0;

  React.useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' });
  }, []);

  React.useEffect(() => {
    if (!source) return;
    player.setActiveForLockScreen(true, { title: `${story.title} · Section ${page + 1}`, artist: 'Eudora Moon' });
    return () => player.clearLockScreenControls();
  }, [source, page, player, story.title]);

  React.useEffect(() => () => {
    try { player.pause(); } catch { /* The player may already be released. */ }
  }, [player]);

  React.useEffect(() => {
    if (!narrationReady) return;
    const seek = pendingSeek.current;
    const shouldResume = resumeAfterSceneChange.current;
    if (seek === null && !shouldResume) return;
    pendingSeek.current = null;
    resumeAfterSceneChange.current = false;
    if (seek !== null) void player.seekTo(seek);
    if (shouldResume) player.play();
  }, [narrationReady, player]);

  React.useEffect(() => {
    if (!status.didJustFinish || !narrationReady || page >= pages.length - 1) return;
    pendingSeek.current = 0;
    resumeAfterSceneChange.current = true;
    setPage((currentPage) => Math.min(currentPage + 1, pages.length - 1));
  }, [narrationReady, page, pages.length, status.didJustFinish]);

  if (!current) return <View style={styles.empty}><Text style={styles.emptyText}>This story is being prepared. Please return to the library and try again later.</Text></View>;

  const hasNext = page < pages.length - 1;
  const nextChapter = pages[page + 1]?.chapter.title;
  const nextLabel = hasNext ? `Up next · ${nextChapter || 'Continue the story'}` : 'Up next · The end of this story';

  const seekStory = (progress: number, shouldResume = status.playing) => {
    if (!Number.isFinite(storyDuration) || storyDuration <= 0) return;
    const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(progress, 1)) : 0;
    const target = safeProgress * storyDuration;
    let elapsed = 0;
    let targetPage = 0;
    for (let index = 0; index < sectionDurations.length; index += 1) {
      const duration = sectionDurations[index] ?? 0;
      if (target <= elapsed + duration || index === sectionDurations.length - 1) {
        targetPage = index;
        break;
      }
      elapsed += duration;
    }
    const offset = Number.isFinite(target - elapsed) ? Math.max(0, target - elapsed) : 0;
    if (targetPage === page && narrationReady) {
      void player.seekTo(offset);
      if (shouldResume) player.play(); else player.pause();
      return;
    }
    player.pause();
    pendingSeek.current = offset;
    resumeAfterSceneChange.current = shouldResume;
    setPage(targetPage);
  };

  const seekBy = (seconds: number) => {
    const target = completedDuration + currentTime + seconds;
    seekStory(storyDuration ? target / storyDuration : 0, status.playing);
  };

  const changeSection = (offset: number) => {
    const targetPage = Math.max(0, Math.min(page + offset, pages.length - 1));
    if (targetPage === page) return;
    player.pause();
    pendingSeek.current = 0;
    resumeAfterSceneChange.current = status.playing;
    setPage(targetPage);
  };

  const toggleNarration = () => {
    if (!narrationReady) return;
    if (status.playing) { player.pause(); return; }
    if (status.didJustFinish || (page === pages.length - 1 && status.duration > 0 && status.currentTime >= status.duration)) {
      seekStory(0, true);
      return;
    }
    player.play();
  };

  return (
    <View style={styles.root}>
      <ImageBackground source={backgroundSource ?? undefined} style={styles.scene} imageStyle={styles.sceneImage}>
        {!background ? <View style={styles.fallbackArtwork} /> : null}
        <LinearGradient pointerEvents="none" colors={['rgba(4, 8, 26, 0.52)', 'rgba(5, 9, 26, 0.06)', 'rgba(5, 9, 26, 0.18)']} locations={[0, 0.28, 0.48]} style={styles.headerFade} />
        <LinearGradient pointerEvents="none" colors={['rgba(5, 9, 26, 0)', 'rgba(5, 9, 26, 0.44)', 'rgba(5, 9, 26, 0.92)']} locations={[0, 0.44, 1]} style={styles.readingFade} />

        <Animated.View entering={FadeIn.duration(450)} style={[styles.header, { paddingTop: Math.max(insets.top, 18) }]}> 
          <Surface elevation={2} style={styles.backSurface}>
            <TouchableRipple accessibilityRole="button" accessibilityLabel="Return to library" borderless onPress={onExit} style={styles.iconHitArea}>
              <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
            </TouchableRipple>
          </Surface>
          <View style={styles.titleBlock}>
            <Text style={styles.sectionType}>{current.chapter.title || 'Story time'}</Text>
            <Text numberOfLines={2} style={styles.storyTitle}>{story.title}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </Animated.View>

        <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 20) }]}> 
          <Animated.View key={current.segment.id} entering={FadeInDown.duration(480).springify()} style={styles.readingContent}>
            <TimedNarration text={current.segment.text} timings={current.segment.narrationTimings} currentTime={status.currentTime} />

            {status.error ? <Text accessibilityRole="alert" style={styles.audioError}>Narration could not be loaded. Please try another section.</Text> : null}

            <View style={styles.upNextRow}>
              <Ionicons name="sparkles" size={17} color="#F8C56A" />
              <Text numberOfLines={1} style={styles.upNext}>{nextLabel}</Text>
            </View>

            <SectionProgress total={pages.length} current={page} progress={storyProgress} onSeek={(progress) => seekStory(progress)} />

            <View style={styles.sectionControls}>
              <SectionButton icon="play-skip-back" label="Previous section" disabled={page === 0} onPress={() => changeSection(-1)} />
              <SectionButton icon="play-skip-forward" label="Next section" disabled={!hasNext} onPress={() => changeSection(1)} />
            </View>

            <View style={styles.controls}>
              <ControlButton icon="play-back" label="Rewind 15 seconds" disabled={!narrationReady} onPress={() => seekBy(-15)} />
              <ControlButton icon={status.playing ? 'pause' : 'play'} label={status.playing ? 'Pause narration' : narrationReady ? 'Play narration' : 'Preparing narration'} disabled={!narrationReady} onPress={toggleNarration} primary />
              <ControlButton icon="play-forward" label="Forward 15 seconds" disabled={!narrationReady} onPress={() => seekBy(15)} />
            </View>
          </Animated.View>
        </View>
      </ImageBackground>
    </View>
  );
}

function TimedNarration({ text, timings, currentTime }: { text: string; timings?: NarrationTimings | null; currentTime: number }) {
  const spokenCharacters = React.useMemo(() => spokenCharacterCount(text, timings, currentTime), [text, timings, currentTime]);
  if (!timings?.character_end_times_seconds?.length) return <Text style={styles.segmentText}>{text}</Text>;
  return (
    <Text accessibilityLabel={text} style={styles.segmentText}>
      <Text style={styles.spokenNarration}>{text.slice(0, spokenCharacters)}</Text>
      <Text style={styles.pendingNarration}>{text.slice(spokenCharacters)}</Text>
    </Text>
  );
}

function spokenCharacterCount(text: string, timings: NarrationTimings | null | undefined, seconds: number) {
  const ends = timings?.character_end_times_seconds;
  if (!ends?.length) return text.length;
  let spoken = 0;
  while (spoken < ends.length && ends[spoken] <= seconds) spoken += 1;
  return Math.min(spoken, text.length);
}

function SectionProgress({ total, current, progress, onSeek }: { total: number; current: number; progress: number; onSeek: (progress: number) => void }) {
  const safeTotal = Math.max(total, 1);
  const [timelineWidth, setTimelineWidth] = React.useState(0);
  return (
    <Pressable
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Story progress: section ${current + 1} of ${safeTotal}`}
      accessibilityHint="Tap the timeline to move through the story and change scenes."
      accessibilityValue={{ min: 0, max: 100, now: Math.round((Number.isFinite(progress) ? progress : 0) * 100) }}
      onLayout={(event) => setTimelineWidth(event.nativeEvent.layout.width)}
      onPress={(event) => {
        if (timelineWidth > 0 && Number.isFinite(event.nativeEvent.locationX)) onSeek(event.nativeEvent.locationX / timelineWidth);
      }}
      style={styles.progressWrap}
    >
      <ProgressBar progress={progress} color="#FF9B54" style={styles.progressTrack} />
      <View pointerEvents="none" style={styles.milestones}>
        {Array.from({ length: safeTotal }, (_, index) => {
          const complete = index < current;
          const active = index === current;
          return <View key={index} style={[styles.milestone, complete && styles.milestoneComplete, active && styles.milestoneCurrent]}>
            {complete ? <Ionicons name="checkmark" size={13} color="#2B1A0D" /> : active ? <View style={styles.currentDot} /> : null}
          </View>;
        })}
      </View>
    </Pressable>
  );
}

function narrationDuration(segment: StoryPage['segment']) {
  if (Number.isFinite(segment.narrationDurationMs) && (segment.narrationDurationMs ?? 0) > 0) return (segment.narrationDurationMs ?? 0) / 1000;
  const ends = segment.narrationTimings?.character_end_times_seconds;
  const finalTimestamp = ends?.length ? Number(ends[ends.length - 1]) : 0;
  return Number.isFinite(finalTimestamp) && finalTimestamp > 0 ? Math.max(finalTimestamp, 1) : 8;
}

function ControlButton({ icon, label, disabled, onPress, primary = false }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; disabled: boolean; onPress: () => void; primary?: boolean }) {
  return (
    <Surface elevation={primary ? 4 : 1} style={[styles.controlSurface, primary ? styles.primaryButton : styles.secondaryButton, disabled && styles.disabled]}>
      <TouchableRipple accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} borderless onPress={onPress} style={styles.controlHitArea}>
        <Ionicons name={icon} size={primary ? 30 : 22} color="#FFFFFF" style={icon === 'play' ? styles.playIcon : undefined} />
      </TouchableRipple>
    </Surface>
  );
}

function SectionButton({ icon, label, disabled, onPress }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <TouchableRipple accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} borderless onPress={onPress} style={[styles.sectionButton, disabled && styles.sectionButtonDisabled]}>
      <View style={styles.sectionButtonContent}>
        <Ionicons name={icon} size={17} color="#FFF1C8" />
        <Text style={styles.sectionButtonText}>{label}</Text>
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070B1A' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: '#070B1A' },
  emptyText: { color: '#FFFFFF', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  scene: { flex: 1, backgroundColor: '#101326' },
  sceneImage: { resizeMode: 'cover' },
  fallbackArtwork: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#171D38' },
  headerFade: { position: 'absolute', top: 0, right: 0, left: 0, height: '40%' },
  readingFade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, gap: 12 },
  backSurface: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', backgroundColor: 'rgba(7, 12, 32, 0.5)' },
  iconHitArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { flex: 1, alignItems: 'center', paddingTop: 4 },
  sectionType: { color: '#F8D997', fontFamily: moon.fonts.bodyBold, letterSpacing: 1.6, fontSize: 11, marginBottom: 7, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 5 },
  storyTitle: { color: '#FFFFFF', fontFamily: moon.fonts.displayExtraBold, fontSize: 27, lineHeight: 33, textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 8 },
  headerSpacer: { width: 48 },
  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 24, paddingTop: 150 },
  readingContent: { gap: 0 },
  segmentText: { color: '#FFFDF7', fontSize: 20, lineHeight: 31, fontFamily: moon.fonts.bodySemiBold, textShadowColor: 'rgba(0,0,0,0.72)', textShadowRadius: 6 },
  spokenNarration: { color: '#FFFDF7' },
  pendingNarration: { color: 'rgba(255, 253, 247, 0.42)' },
  audioError: { color: '#FFD4C0', fontSize: 14, lineHeight: 20, fontFamily: moon.fonts.bodyBold, marginTop: 14, textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 5 },
  upNextRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 12 },
  upNext: { color: '#FFFFFF', fontSize: 16, fontFamily: moon.fonts.bodyBold, flex: 1, textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 4 },
  progressWrap: { height: 34, justifyContent: 'center' },
  progressTrack: { height: 5, borderRadius: 99, backgroundColor: 'rgba(239, 238, 255, 0.32)' },
  milestones: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  milestone: { width: 15, height: 15, borderRadius: 8, backgroundColor: '#A6ABC3', borderWidth: 2, borderColor: '#F7F3E8' },
  milestoneComplete: { backgroundColor: '#FFC66E', borderColor: '#FFF1C8' },
  milestoneCurrent: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FF8D42', borderColor: '#FFE6AF', shadowColor: '#FF9B54', shadowOpacity: 0.95, shadowRadius: 8, elevation: 6 },
  currentDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#FFFFFF' },
  sectionControls: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 10 },
  sectionButton: { minHeight: 38, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 19, backgroundColor: 'rgba(16, 21, 46, 0.58)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  sectionButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  sectionButtonText: { color: '#FFF1C8', fontSize: 12, fontFamily: moon.fonts.bodyBold },
  sectionButtonDisabled: { opacity: 0.38 },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 22, marginTop: 18 },
  controlSurface: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  controlHitArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  primaryButton: { width: 78, height: 78, borderRadius: 39, backgroundColor: '#FF7D3D', shadowColor: '#FF7D3D', shadowOpacity: 0.7, shadowRadius: 13, elevation: 8 },
  secondaryButton: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(16, 21, 46, 0.64)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)' },
  playIcon: { marginLeft: 3 },
  disabled: { opacity: 0.38 },
});
