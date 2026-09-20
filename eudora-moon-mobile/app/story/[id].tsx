import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { StoryReader } from '@/components/StoryReader';
import { useSession } from '@/session';
import { useGetStoryQuery } from '@/store';
import { moon } from '@/theme';

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { tokens, loading } = useSession();
  const { data: story, error: storyError, refetch } = useGetStoryQuery(id ?? '', { skip: !tokens || !id });

  if (loading) return null;
  if (!tokens) return <Redirect href="/sign-in" />;
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: story?.title ?? 'Story', headerBackTitle: 'Library' }} />
      <StatusBar style={story ? 'light' : 'dark'} />
      {!story && !storyError ? <View style={styles.center}><ActivityIndicator color={moon.colors.primary} /><Text style={styles.loading}>Opening story…</Text></View> : null}
      {storyError ? <View style={styles.error}><Text style={styles.errorText}>{apiErrorMessage(storyError)}</Text><Pressable accessibilityRole="button" onPress={() => void refetch()} style={styles.retry}><Text style={styles.retryText}>Try again</Text></Pressable><Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.back}>Return to library</Text></Pressable></View> : null}
      {story ? <StoryReader key={`${story.id}:${story.releaseId ?? 'current'}`} story={story} token={tokens.accessToken} onExit={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/library');
      }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: moon.colors.canvas },
  center: { flex: 1, minHeight: 340, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loading: { color: moon.colors.muted, fontSize: 16, fontFamily: moon.fonts.body },
  error: { backgroundColor: '#FFF1F0', borderRadius: moon.radius, padding: 20, gap: 16, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { color: moon.colors.danger, fontSize: 16, lineHeight: 23, fontFamily: moon.fonts.body },
  retry: { alignSelf: 'flex-start', backgroundColor: moon.colors.danger, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11 },
  retryText: { color: '#FFFFFF', fontFamily: moon.fonts.bodyBold },
  back: { color: moon.colors.primary, fontFamily: moon.fonts.bodyBold },
});

function apiErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: { message?: string | string[] } }).data;
    if (Array.isArray(data?.message)) return data.message.join(' ');
    if (data?.message) return data.message;
  }
  return 'We could not open this story.';
}
