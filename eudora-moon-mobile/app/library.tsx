import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMediaSource, type StoryCard as StoryCardModel } from '@/api';
import { useSession } from '@/session';
import { useGetLibraryQuery } from '@/store';
import { moon } from '@/theme';

type Category = { key: string; label: string; symbol: string; color: string; disabled?: boolean };

const FALLBACK_CATEGORIES: Category[] = [
  { key: 'animals', label: 'Animals', symbol: '✦', color: moon.colors.peach },
  { key: 'space', label: 'Space', symbol: '☾', color: moon.colors.lavender },
  { key: 'magic', label: 'Magic', symbol: '✧', color: '#E9D1F8' },
  { key: 'calm', label: 'Calm', symbol: '☁', color: moon.colors.mint },
];

export default function LibraryScreen() {
  const { tokens, loading, signOut } = useSession();
  const insets = useSafeAreaInsets();
  const [selectedTopic, setSelectedTopic] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [accountOpen, setAccountOpen] = React.useState(false);
  const { data: library = [], error: libraryError, isFetching, refetch } = useGetLibraryQuery(undefined, { skip: !tokens });
  const error = libraryError ? apiErrorMessage(libraryError) : null;

  const topics = React.useMemo(
    () => Array.from(new Set(library.flatMap((story) => story.topics ?? []))).sort(),
    [library],
  );
  const categories = React.useMemo<Category[]>(() => {
    if (!topics.length) return FALLBACK_CATEGORIES.map((category) => ({ ...category, disabled: true }));
    return topics.slice(0, 6).map((topic, index) => ({
      key: topic,
      label: topicLabel(topic),
      symbol: FALLBACK_CATEGORIES[index % FALLBACK_CATEGORIES.length].symbol,
      color: FALLBACK_CATEGORIES[index % FALLBACK_CATEGORIES.length].color,
    }));
  }, [topics]);
  const visibleLibrary = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return library.filter((story) => {
      const matchesTopic = selectedTopic === 'all' || (story.topics ?? []).includes(selectedTopic);
      const searchable = `${story.title} ${story.synopsis ?? ''} ${(story.topics ?? []).join(' ')}`.toLowerCase();
      return matchesTopic && (!query || searchable.includes(query));
    });
  }, [library, search, selectedTopic]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={moon.colors.primary} />
        <Text style={styles.loading}>Opening your library…</Text>
      </View>
    );
  }
  if (!tokens) return <Redirect href="/sign-in" />;

  const refresh = async () => { await refetch(); };
  const featured = visibleLibrary[0];
  const recommended = visibleLibrary.slice(featured ? 1 : 0);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: Math.max(insets.top, 18), paddingBottom: 120 + Math.max(insets.bottom, 12) }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={() => void refresh()} tintColor={moon.colors.primary} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.heading}>Eudora Moon</Text>
            <Text style={styles.welcome}>Good evening, reader</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Open account menu" onPress={() => setAccountOpen((open) => !open)} style={styles.avatar}>
            <Text style={styles.avatarText}>☾</Text>
          </Pressable>
          {accountOpen ? <View style={styles.accountMenu}><Text style={styles.accountTitle}>Reader account</Text><Text style={styles.accountEmail}>{tokens.user.email}</Text><Pressable accessibilityRole="button" accessibilityLabel="Sign out" onPress={() => void signOut()} style={styles.accountSignOut}><Text style={styles.accountSignOutText}>Sign out</Text></Pressable></View> : null}
        </View>

        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Search for a story"
            autoCapitalize="none"
            clearButtonMode="while-editing"
            onChangeText={setSearch}
            placeholder="Search for a story"
            placeholderTextColor={moon.colors.muted}
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Voice search" onPress={() => Alert.alert('Voice search', 'Voice search is not available yet. Try typing a title or topic instead.')} style={styles.voiceButton}>
            <Text style={styles.voiceIcon}>◉</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Find your next adventure</Text>
          {topics.length ? <Text style={styles.topicCount}>{topics.length} topics</Text> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          <CategoryButton label="All" symbol="✦" color={moon.colors.peach} selected={selectedTopic === 'all'} onPress={() => setSelectedTopic('all')} />
          {categories.map((category) => (
            <CategoryButton
              key={category.key}
              label={category.label}
              symbol={category.symbol}
              color={category.color}
              disabled={category.disabled}
              selected={selectedTopic === category.key}
              onPress={() => { if (!category.disabled) setSelectedTopic(category.key); }}
            />
          ))}
        </ScrollView>

        {error ? (
          <View style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void refetch()} style={styles.retry}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Featured tonight</Text>
          <Pressable accessibilityRole="button" onPress={() => setSelectedTopic('all')}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>
        {featured ? (
          <FeaturedStory story={featured} token={tokens.accessToken} onPress={() => router.push(`/story/${featured.id}` as never)} />
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{search ? 'No stories found' : 'New stories are on their way'}</Text>
            <Text style={styles.emptyText}>{search ? 'Try a different title, topic, or phrase.' : 'When a grown-up publishes a narrated story, it will appear here.'}</Text>
          </View>
        )}

        {recommended.length ? <Text style={[styles.sectionTitle, styles.recommendedHeading]}>Recommended for you</Text> : null}
        <View style={styles.recommendedList}>
          {recommended.map((story) => <RecommendedStory key={story.id} story={story} token={tokens.accessToken} onPress={() => router.push(`/story/${story.id}` as never)} />)}
        </View>
        {!topics.length ? <Text style={styles.helper}>Topics will appear here as stories are tagged by a grown-up.</Text> : null}
      </ScrollView>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <NavButton label="Home" symbol="⌂" selected onPress={() => { setSelectedTopic('all'); setSearch(''); }} />
        <NavButton label="Library" symbol="▤" onPress={() => setSelectedTopic('all')} />
        <NavButton label="Progress" symbol="◔" disabled onPress={() => undefined} />
      </View>
    </View>
  );
}

function CategoryButton({ label, symbol, color, selected, disabled, onPress }: Omit<Category, 'key'> & { selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={[styles.category, { backgroundColor: color }, selected && styles.categorySelected, disabled && styles.categoryDisabled]}>
      <View style={[styles.categoryIcon, selected && styles.categoryIconSelected]}><Text style={styles.categorySymbol}>{symbol}</Text></View>
      <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function FeaturedStory({ story, token, onPress }: { story: StoryCardModel; token: string; onPress: () => void }) {
  const coverSource = useMediaSource(story.coverUrl, token);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Read featured story ${story.title}`} onPress={onPress} style={({ pressed }) => [styles.featured, pressed && styles.pressed]}>
      {coverSource ? <Image source={coverSource} style={styles.featuredImage} resizeMode="cover" /> : <FeaturedArtwork />}
      <View style={styles.featuredShade} />
      <View style={styles.featuredCopy}>
        <Text numberOfLines={2} style={styles.featuredTitle}>{story.title}</Text>
        <Text style={styles.featuredMeta}>{story.pageCount} {story.pageCount === 1 ? 'page' : 'pages'} · narrated</Text>
      </View>
      <View style={styles.featuredPlay}><Text style={styles.featuredPlayText}>▶</Text></View>
    </Pressable>
  );
}

function FeaturedArtwork() {
  return <View style={styles.featuredArtwork}><View style={styles.featuredSun} /><View style={styles.featuredHillBack} /><View style={styles.featuredHillFront} /><Text style={styles.featuredSparkles}>✦  ✧  ✦</Text></View>;
}

function RecommendedStory({ story, token, onPress }: { story: StoryCardModel; token: string; onPress: () => void }) {
  const coverSource = useMediaSource(story.coverUrl, token);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Read ${story.title}`} onPress={onPress} style={({ pressed }) => [styles.recommendedCard, pressed && styles.pressed]}>
      {coverSource ? <Image source={coverSource} style={styles.recommendedImage} resizeMode="cover" /> : <View style={[styles.recommendedImage, styles.recommendedPlaceholder]}><Text style={styles.placeholderMoon}>☾</Text></View>}
      <View style={styles.recommendedCopy}>
        <Text numberOfLines={2} style={styles.recommendedTitle}>{story.title}</Text>
        {story.synopsis ? <Text numberOfLines={2} style={styles.recommendedSynopsis}>{story.synopsis}</Text> : null}
        <Text style={styles.recommendedMeta}>{story.pageCount} {story.pageCount === 1 ? 'page' : 'pages'} · narrated</Text>
        {story.topics?.length ? <View style={styles.topicChips}>{story.topics.slice(0, 2).map((topic) => <Text key={topic} style={styles.topicChip}>{topicLabel(topic)}</Text>)}</View> : null}
      </View>
      <Text style={styles.recommendedArrow}>›</Text>
    </Pressable>
  );
}

function NavButton({ label, symbol, selected, disabled, onPress }: { label: string; symbol: string; selected?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.navButton, disabled && styles.navDisabled]}><Text style={[styles.navSymbol, selected && styles.navSelected]}>{symbol}</Text><Text style={[styles.navLabel, selected && styles.navSelected]}>{label}</Text></Pressable>;
}

function topicLabel(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function apiErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { message?: string | string[] } }).data;
    if (Array.isArray(data?.message)) return data.message.join(' ');
    if (data?.message) return data.message;
  }
  return 'We could not load your stories.';
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: moon.colors.canvas },
  scroll: { flexGrow: 1, paddingHorizontal: 20, gap: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: moon.colors.canvas },
  loading: { color: moon.colors.muted, fontSize: 16, fontFamily: moon.fonts.body },
  header: { position: 'relative', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 },
  heading: { color: moon.colors.ink, fontSize: 28, lineHeight: 34, fontFamily: moon.fonts.displayBold },
  welcome: { color: moon.colors.muted, fontSize: 16, lineHeight: 22, marginTop: 4, fontFamily: moon.fonts.body },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: moon.colors.primary },
  avatarText: { color: '#FFFFFF', fontSize: 25, fontFamily: moon.fonts.displayBold },
  accountMenu: { position: 'absolute', top: 56, right: 0, zIndex: 5, minWidth: 178, borderRadius: 17, borderWidth: 1, borderColor: moon.colors.border, backgroundColor: moon.colors.surface, padding: 13, shadowColor: '#302A3D', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  accountTitle: { color: moon.colors.ink, fontSize: 13, fontFamily: moon.fonts.bodyBold },
  accountEmail: { color: moon.colors.muted, fontSize: 11, marginTop: 3, fontFamily: moon.fonts.body },
  accountSignOut: { marginTop: 11, borderRadius: 10, backgroundColor: '#FDEBE4', paddingHorizontal: 10, paddingVertical: 8 },
  accountSignOutText: { color: '#B84B2B', fontSize: 12, fontFamily: moon.fonts.bodyBold },
  searchBar: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderRadius: 30, backgroundColor: '#F1EBDD', paddingLeft: 17, paddingRight: 7 },
  searchIcon: { color: moon.colors.ink, fontSize: 29, lineHeight: 30, marginTop: -4, fontFamily: moon.fonts.body },
  searchInput: { flex: 1, color: moon.colors.ink, fontSize: 15, paddingHorizontal: 11, paddingVertical: 12, fontFamily: moon.fonts.body },
  voiceButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: moon.colors.primary },
  voiceIcon: { color: '#FFFFFF', fontSize: 19, fontFamily: moon.fonts.bodyBold },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: moon.colors.ink, fontSize: 20, fontFamily: moon.fonts.displayBold },
  topicCount: { color: moon.colors.muted, fontSize: 12, fontFamily: moon.fonts.bodyBold },
  seeAll: { color: moon.colors.muted, fontSize: 13, fontFamily: moon.fonts.bodyBold },
  categoryRow: { gap: 10, paddingRight: 20 },
  category: { width: 78, minHeight: 88, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 5 },
  categorySelected: { borderWidth: 2, borderColor: moon.colors.primary },
  categoryDisabled: { opacity: 0.58 },
  categoryIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.48)' },
  categoryIconSelected: { backgroundColor: moon.colors.primary },
  categorySymbol: { color: moon.colors.ink, fontSize: 21, fontFamily: moon.fonts.displayBold },
  categoryText: { color: moon.colors.ink, fontSize: 12, fontFamily: moon.fonts.bodyBold },
  categoryTextSelected: { color: moon.colors.ink },
  featured: { height: 218, borderRadius: 28, overflow: 'hidden', backgroundColor: moon.colors.night, position: 'relative', shadowColor: '#332579', shadowOpacity: 0.18, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  featuredImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  featuredArtwork: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: moon.colors.night, overflow: 'hidden' },
  featuredSun: { position: 'absolute', width: 82, height: 82, borderRadius: 41, right: 32, top: 28, backgroundColor: '#FFCB54' },
  featuredHillBack: { position: 'absolute', width: 370, height: 160, borderRadius: 200, left: -45, bottom: -93, backgroundColor: '#55448F' },
  featuredHillFront: { position: 'absolute', width: 350, height: 130, borderRadius: 180, left: 20, bottom: -75, backgroundColor: '#443583' },
  featuredSparkles: { position: 'absolute', left: 28, top: 25, color: '#FFE6A8', fontSize: 22, letterSpacing: 4 },
  featuredShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(16, 14, 48, 0.18)' },
  featuredCopy: { position: 'absolute', left: 20, right: 74, bottom: 19 },
  featuredTitle: { color: '#FFFFFF', fontSize: 21, lineHeight: 26, fontFamily: moon.fonts.displayBold },
  featuredMeta: { color: '#F8EFD7', fontSize: 12, marginTop: 5, fontFamily: moon.fonts.bodyBold },
  featuredPlay: { position: 'absolute', right: 18, bottom: 18, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: moon.colors.primary },
  featuredPlayText: { color: '#FFFFFF', fontSize: 17, marginLeft: 2 },
  recommendedHeading: { marginTop: 4 },
  recommendedList: { gap: 12 },
  recommendedCard: { minHeight: 116, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 9, borderWidth: 1, borderColor: moon.colors.border, borderRadius: 22, backgroundColor: moon.colors.surface },
  recommendedImage: { width: 105, height: 98, borderRadius: 17, backgroundColor: moon.colors.sky },
  recommendedPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: moon.colors.lavender },
  placeholderMoon: { color: moon.colors.primary, fontSize: 46 },
  recommendedCopy: { flex: 1, gap: 4 },
  recommendedTitle: { color: moon.colors.ink, fontSize: 16, lineHeight: 20, fontFamily: moon.fonts.displayBold },
  recommendedSynopsis: { color: moon.colors.muted, fontSize: 12, lineHeight: 17, fontFamily: moon.fonts.body },
  recommendedMeta: { color: moon.colors.primary, fontSize: 11, fontFamily: moon.fonts.bodyBold },
  topicChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  topicChip: { color: moon.colors.primary, backgroundColor: '#F1E9FF', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3, fontSize: 10, fontFamily: moon.fonts.bodyBold, overflow: 'hidden' },
  recommendedArrow: { color: moon.colors.muted, fontSize: 28, marginRight: 4, fontFamily: moon.fonts.body },
  empty: { borderRadius: 22, borderWidth: 1, borderStyle: 'dashed', borderColor: moon.colors.border, backgroundColor: moon.colors.surface, padding: 22, gap: 6 },
  emptyTitle: { color: moon.colors.ink, fontSize: 18, fontFamily: moon.fonts.displayBold },
  emptyText: { color: moon.colors.muted, fontSize: 14, lineHeight: 21, fontFamily: moon.fonts.body },
  helper: { color: moon.colors.muted, textAlign: 'center', fontSize: 12, lineHeight: 18, paddingHorizontal: 20, fontFamily: moon.fonts.body },
  error: { backgroundColor: '#FFF1F0', borderRadius: 18, borderWidth: 1, borderColor: '#FECACA', padding: 15, gap: 8 },
  errorText: { color: moon.colors.danger, fontSize: 14, lineHeight: 20, fontFamily: moon.fonts.body },
  retry: { alignSelf: 'flex-start', paddingVertical: 5 },
  retryText: { color: moon.colors.danger, fontFamily: moon.fonts.bodyBold },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  bottomNav: { position: 'absolute', right: 14, bottom: 0, left: 14, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: 'rgba(255, 254, 248, 0.97)', paddingTop: 12, shadowColor: '#302A3D', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: -5 }, elevation: 8 },
  navButton: { minWidth: 68, alignItems: 'center', gap: 3, paddingVertical: 3 },
  navSymbol: { color: moon.colors.muted, fontSize: 22, lineHeight: 25, fontFamily: moon.fonts.body },
  navLabel: { color: moon.colors.muted, fontSize: 11, fontFamily: moon.fonts.bodyBold },
  navSelected: { color: moon.colors.primary },
  navDisabled: { opacity: 0.55 },
});
