import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ModuleItem } from '@/core/contracts';
import { AssessmentItemView } from '@/features/assessment/AssessmentItemView';
import { useGetCourseDetailQuery } from '@/features/catalog/catalogApi';
import { useActingChild } from '@/features/guardian/useActingChild';
import { DiscussionItemView } from '@/features/lesson/DiscussionItemView';
import { HomeworkItemView } from '@/features/lesson/HomeworkItemView';
import { LiveClassItemView } from '@/features/lesson/LiveClassItemView';
import { ReadingItemView } from '@/features/lesson/ReadingItemView';
import { StoryItemView } from '@/features/story/StoryItemView';
import { VideoItemView } from '@/features/lesson/VideoItemView';
import { Text } from '@/ui/primitives/Text';
import { useTheme } from '@/ui/theme/ThemeProvider';

/**
 * Exhaustive rather than an `if/else` chain ending in a catch-all: the item
 * screen used to fall through to `AssessmentItemView` for any kind it didn't
 * name, so `HOMEWORK` and `LIVE_CLASS` silently rendered as a broken
 * assessment for weeks after the API added them. A `switch` with no `default`
 * makes the *next* new kind a compile error here instead — TypeScript's
 * exhaustiveness check on `item.kind` fails the build the moment a case is
 * missing, rather than shipping a wrong screen and waiting for a bug report.
 */
function renderItem(item: ModuleItem, courseId: string): React.ReactElement {
  switch (item.kind) {
    case 'VIDEO':
      return <VideoItemView item={item} courseId={courseId} />;
    case 'READING':
      return <ReadingItemView item={item} courseId={courseId} />;
    case 'DISCUSSION':
      return <DiscussionItemView item={item} courseId={courseId} />;
    case 'ASSESSMENT':
      return <AssessmentItemView item={item} courseId={courseId} />;
    case 'HOMEWORK':
      return <HomeworkItemView item={item} courseId={courseId} />;
    case 'LIVE_CLASS':
      return <LiveClassItemView item={item} courseId={courseId} />;
    case 'STORY':
      return <StoryItemView item={item} courseId={courseId} />;
  }
}

/**
 * There is no `GET /catalog/module-items/:id` endpoint — a ModuleItem's full
 * data only exists nested in `GET /catalog/courses/:id`. Rather than thread
 * the item's fields through navigation params, this re-reads the already-
 * cached course-detail query (an instant cache hit — the outline screen just
 * fetched it) and finds the item by id.
 */
export default function ModuleItemScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { courseId, itemId } = useLocalSearchParams<{
    courseId: string;
    itemId: string;
  }>();

  const { actingChildId } = useActingChild();
  const { data: course, isLoading } = useGetCourseDetailQuery(
    { courseId: courseId!, actingChildId },
    { skip: !courseId },
  );

  const item = course?.concepts
    .flatMap((c) => c.items)
    .find((i) => i.id === itemId);

  if (isLoading || !course) {
    return (
      <View style={centered(t.colors.background)}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={centered(t.colors.background)}>
        <Text variant="body" color="mutedForeground">
          This item couldn&apos;t be found.
        </Text>
      </View>
    );
  }

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

      <Text variant="title">{item.title}</Text>
      <View style={{ height: t.spacing.xl }} />

      {renderItem(item, courseId!)}
    </ScrollView>
  );
}

function centered(background: string) {
  return {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: background,
  };
}
