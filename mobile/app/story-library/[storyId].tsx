import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StoryReader } from '@/features/story/StoryReader';
import { useGetLibraryStoryQuery } from '@/features/story/storyApi';
import { Card } from '@/ui/primitives/Card';
import { Text } from '@/ui/primitives/Text';
import { useTheme } from '@/ui/theme/ThemeProvider';

/**
 * Reading a library story.
 *
 * The same reader the course surface uses. No progress is recorded and no
 * completion button is offered: a library story fills no curriculum slot, so
 * there is no ModuleItem to mark done.
 */
export default function LibraryStoryScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { storyId } = useLocalSearchParams<{ storyId: string }>();

  const { data: story, isLoading, error } = useGetLibraryStoryQuery(storyId!, {
    skip: !storyId,
  });

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
        accessibilityLabel="Back to the story library"
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: t.spacing.lg }}
      >
        <ChevronLeft size={20} color={t.colors.mutedForeground} />
        <Text variant="label" color="mutedForeground">
          Library
        </Text>
      </Pressable>

      {isLoading ? (
        <View style={{ paddingVertical: t.spacing.xxxl, alignItems: 'center' }}>
          <ActivityIndicator color={t.colors.primary} />
        </View>
      ) : error || !story ? (
        <Card>
          <Text variant="body" color="mutedForeground">
            This story could not be opened. It may have been unpublished since you last saw it.
          </Text>
        </Card>
      ) : (
        <StoryReader story={story} />
      )}
    </ScrollView>
  );
}
