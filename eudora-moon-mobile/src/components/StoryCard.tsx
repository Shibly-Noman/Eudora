import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useMediaSource, type StoryCard as StoryCardModel } from '@/api';
import { moon } from '@/theme';

export function StoryCard({ story, token, onPress }: { story: StoryCardModel; token: string; onPress: () => void }) {
  const coverSource = useMediaSource(story.coverUrl, token);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Read ${story.title}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {coverSource ? (
        <Image source={coverSource} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.cover, styles.placeholder]} accessibilityLabel="Story cover awaiting illustration">
          <Text style={styles.moon}>☾</Text>
        </View>
      )}
      <View style={styles.copy}>
        <Text style={styles.title}>{story.title}</Text>
        {story.synopsis ? <Text numberOfLines={3} style={styles.synopsis}>{story.synopsis}</Text> : null}
        {story.topics?.length ? <View style={styles.topics}>{story.topics.map((topic) => <View key={topic} style={styles.topic}><Text style={styles.topicText}>{topicLabel(topic)}</Text></View>)}</View> : null}
        <Text style={styles.meta}>{story.pageCount} {story.pageCount === 1 ? 'page' : 'pages'} · Narrated</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: moon.colors.surface, borderColor: moon.colors.border, borderWidth: 1, borderRadius: moon.radius, overflow: 'hidden', shadowColor: '#17243B', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  cover: { width: '100%', height: 172, backgroundColor: moon.colors.sky },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  moon: { fontSize: 72, color: moon.colors.primary, fontFamily: moon.fonts.displayBold },
  copy: { padding: 16, gap: 7 },
  title: { color: moon.colors.ink, fontSize: 20, lineHeight: 26, fontFamily: moon.fonts.displayBold },
  synopsis: { color: moon.colors.muted, fontSize: 15, lineHeight: 21, fontFamily: moon.fonts.body },
  topics: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  topic: { backgroundColor: '#EEEAFE', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  topicText: { color: moon.colors.primary, fontSize: 11, fontFamily: moon.fonts.bodyBold },
  meta: { color: moon.colors.primary, fontSize: 13, fontFamily: moon.fonts.bodyBold, marginTop: 2 },
});

function topicLabel(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
