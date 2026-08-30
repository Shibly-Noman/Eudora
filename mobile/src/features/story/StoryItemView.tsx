import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { ModuleItem } from '@/core/contracts';
import { useUpdateModuleItemProgressMutation } from '@/features/catalog/catalogApi';
import { useActingChild } from '@/features/guardian/useActingChild';
import { LockedItemNotice } from '@/features/lesson/LockedItemNotice';
import { StoryReader } from '@/features/story/StoryReader';
import { useGetStoryByModuleItemQuery } from '@/features/story/storyApi';
import { Button } from '@/ui/primitives/Button';
import { Text } from '@/ui/primitives/Text';
import { useTheme } from '@/ui/theme/ThemeProvider';

interface StoryItemViewProps {
  item: ModuleItem;
  courseId: string;
}

/**
 * A narrated story filling a curriculum slot.
 *
 * Everything about reading one lives in StoryReader, shared with the library.
 * What is particular to a course is here: the entitlement gate, and marking the
 * slot done — neither of which the library has, since a published story belongs
 * to no course and there is no ModuleItem to complete.
 *
 * There is no "ask Clio" panel yet. That needs microphone capture and an upload
 * leg; the reading and listening is the part a child spends their time in, so
 * it ships first rather than waiting.
 */
export function StoryItemView({ item, courseId }: StoryItemViewProps) {
  const t = useTheme();
  const { actingChildId } = useActingChild();

  const locked = item.isContentLocked;
  const { data: story, isLoading } = useGetStoryByModuleItemQuery(
    { moduleItemId: item.id, actingChildId },
    // Nothing to fetch when the API would refuse it anyway.
    { skip: locked },
  );
  const [updateProgress, { isLoading: saving }] = useUpdateModuleItemProgressMutation();

  if (locked) {
    return <LockedItemNotice courseId={courseId} what="story" />;
  }

  if (isLoading) {
    return (
      <View style={{ paddingVertical: t.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  if (!story) {
    return (
      <Text variant="body" style={{ color: t.colors.mutedForeground }}>
        This story could not be opened right now.
      </Text>
    );
  }

  return (
    <StoryReader
      story={story}
      finishSlot={
        <Button
          title={item.isDone ? 'Completed' : 'I finished this story'}
          onPress={() => updateProgress({ id: item.id, completed: true })}
          loading={saving}
          disabled={item.isDone}
          variant={item.isDone ? 'secondary' : 'primary'}
          fullWidth
        />
      }
    />
  );
}
