import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  BookHeadphones,
  CheckCircle2,
  ChevronLeft,
  Circle,
  ClipboardList,
  FileText,
  Lock,
  MessageSquare,
  NotebookPen,
  PlayCircle,
  Radio,
  Sparkles,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CourseConcept, ModuleItem, ModuleItemKind } from '@/core/contracts';
import { useGetCourseDetailQuery } from '@/features/catalog/catalogApi';
import { useActingChild } from '@/features/guardian/useActingChild';
import { Button } from '@/ui/primitives/Button';
import { Card } from '@/ui/primitives/Card';
import { Text } from '@/ui/primitives/Text';
import { useFormFactor } from '@/ui/useFormFactor';
import { useTheme } from '@/ui/theme/ThemeProvider';

// Keyed by `ModuleItemKind` rather than indexed loosely, so adding a kind to
// the union is a compile error here instead of a blank icon at runtime.
const kindIcon: Record<ModuleItemKind, React.ElementType> = {
  VIDEO: PlayCircle,
  READING: FileText,
  DISCUSSION: MessageSquare,
  ASSESSMENT: ClipboardList,
  HOMEWORK: NotebookPen,
  LIVE_CLASS: Radio,
  STORY: BookHeadphones,
};

export default function CourseOutlineScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const formFactor = useFormFactor();
  const { courseId } = useLocalSearchParams<{ courseId: string }>();

  const { actingChildId, isGuardian } = useActingChild();
  const { data: course, isLoading } = useGetCourseDetailQuery(
    { courseId: courseId!, actingChildId },
    { skip: !courseId },
  );

  // Tablet only: which chapter shows in the right-hand pane.
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedConceptId && course && course.concepts.length > 0) {
      setSelectedConceptId(course.concepts[0].id);
    }
  }, [course, selectedConceptId]);

  if (isLoading || !course) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.colors.background,
        }}
      >
        <ActivityIndicator color={t.colors.primary} />
      </View>
    );
  }

  const openLesson = (lessonId: string) => router.push(`/lesson/${lessonId}`);
  const openItem = (itemId: string) =>
    router.push({
      pathname: '/item/[courseId]/[itemId]',
      params: { courseId: courseId!, itemId },
    });

  const backButton = (
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
  );

  const titleBlock = (
    <>
      <Text variant="title">{course.title}</Text>
      <Text variant="caption" color="mutedForeground" style={{ marginTop: t.spacing.xs }}>
        {course.learningSubject.name} · {course.concepts.length} chapters
      </Text>
      {!course.isEntitled ? (
        <Card
          style={{
            marginTop: t.spacing.lg,
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.md,
            backgroundColor: t.colors.accent,
            borderColor: t.colors.primary,
          }}
        >
          <Text variant="body" style={{ flex: 1, color: t.colors.accentForeground }}>
            {isGuardian
              ? 'Unlock this course to see everything past the free preview.'
              : "This course isn't unlocked yet — ask your guardian to purchase it."}
          </Text>
          {isGuardian ? (
            <Button
              title="Unlock"
              onPress={() =>
                router.push({
                  pathname: '/course/[courseId]/unlock',
                  params: { courseId: courseId! },
                })
              }
            />
          ) : null}
        </Card>
      ) : null}
    </>
  );

  // Tablet: a persistent ~340px chapter-nav pane beside the selected
  // chapter's content, matching the web's sidebar-width convention (§5 of
  // the plan) rather than the phone's all-chapters-expanded single column.
  if (formFactor === 'tablet') {
    const selectedConcept =
      course.concepts.find((c) => c.id === selectedConceptId) ?? course.concepts[0];

    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.colors.background }}>
        <ScrollView
          style={{ width: 340, borderRightWidth: 1, borderRightColor: t.colors.border }}
          contentContainerStyle={{
            padding: t.spacing.xl,
            paddingTop: insets.top + t.spacing.md,
            paddingBottom: insets.bottom + t.spacing.xxl,
          }}
        >
          {backButton}
          {titleBlock}
          <View style={{ height: t.spacing.xl }} />
          <View style={{ gap: t.spacing.sm }}>
            {course.concepts.map((concept, index) => (
              <ChapterNavRow
                key={concept.id}
                concept={concept}
                index={index}
                selected={concept.id === selectedConcept?.id}
                onPress={() => setSelectedConceptId(concept.id)}
              />
            ))}
          </View>
        </ScrollView>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: t.spacing.xl,
            paddingTop: insets.top + t.spacing.md,
            paddingBottom: insets.bottom + t.spacing.xxl,
          }}
        >
          {selectedConcept ? (
            <>
              <Text variant="heading">{selectedConcept.name}</Text>
              <View style={{ height: t.spacing.lg }} />
              <ChapterDetail
                concept={selectedConcept}
                courseId={courseId!}
                onOpenLesson={openLesson}
                onOpenItem={openItem}
              />
            </>
          ) : null}
        </ScrollView>
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
      {backButton}
      {titleBlock}
      <View style={{ height: t.spacing.xl }} />

      {course.concepts.map((concept, index) => (
        <Card
          key={concept.id}
          style={{
            marginBottom: t.spacing.md,
            // Locked chapters stay visible but obviously inert — hiding
            // them would lose the sense of a course having a shape.
            opacity: concept.isLocked ? 0.55 : 1,
          }}
        >
          <ChapterHeader concept={concept} index={index} />
          <View style={{ marginTop: t.spacing.md }}>
            <ChapterDetail
              concept={concept}
              courseId={courseId!}
              onOpenLesson={openLesson}
              onOpenItem={openItem}
            />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

function ChapterHeader({ concept, index }: { concept: CourseConcept; index: number }) {
  const t = useTheme();
  const statusIcon = concept.isDone ? (
    <CheckCircle2 size={22} color={t.colors.success} />
  ) : concept.isLocked ? (
    <Lock size={20} color={t.colors.mutedForeground} />
  ) : (
    <Circle size={22} color={t.colors.mutedForeground} />
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.md }}>
      {statusIcon}
      <View style={{ flex: 1 }}>
        <Text variant="caption" color="mutedForeground">
          Chapter {index + 1}
          {concept.kind === 'CHECKPOINT' ? ' · Checkpoint' : ''}
        </Text>
        <Text variant="label">{concept.name}</Text>
      </View>
    </View>
  );
}

function ChapterNavRow({
  concept,
  index,
  selected,
  onPress,
}: {
  concept: CourseConcept;
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card style={selected ? { borderColor: t.colors.primary, borderWidth: 2 } : undefined}>
        <ChapterHeader concept={concept} index={index} />
      </Card>
    </Pressable>
  );
}

/** The items+lessons body for one chapter — shared by the phone's inline card and the tablet's right pane. */
function ChapterDetail({
  concept,
  courseId,
  onOpenLesson,
  onOpenItem,
}: {
  concept: CourseConcept;
  courseId: string;
  onOpenLesson: (lessonId: string) => void;
  onOpenItem: (itemId: string) => void;
}) {
  const t = useTheme();
  const hasContent = concept.lessons.length > 0 || concept.items.length > 0;

  if (concept.isLocked) {
    return (
      <Text variant="caption" color="mutedForeground">
        Finish the previous chapter to unlock.
      </Text>
    );
  }

  if (!hasContent) {
    return (
      <Text variant="caption" color="mutedForeground">
        No content here yet.
      </Text>
    );
  }

  return (
    <View style={{ gap: t.spacing.sm }}>
      {concept.items.map((item) => (
        <ItemRow
          key={item.id}
          item={item}
          courseId={courseId}
          onPress={() => onOpenItem(item.id)}
        />
      ))}
      {concept.lessons.map((lesson) => (
        <Pressable
          key={lesson.id}
          onPress={() => onOpenLesson(lesson.id)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: t.spacing.sm,
            paddingVertical: t.spacing.md,
            paddingHorizontal: t.spacing.md,
            borderRadius: t.radius.md,
            backgroundColor: pressed ? t.colors.muted : t.colors.secondary,
          })}
        >
          <Sparkles size={16} color={t.colors.primary} />
          <Text variant="label" style={{ flex: 1 }}>
            {lesson.title}
          </Text>
          <Text variant="caption" color="mutedForeground">
            +{lesson.xpReward} XP
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ItemRow({
  item,
  courseId,
  onPress,
}: {
  item: ModuleItem;
  courseId: string;
  onPress: () => void;
}) {
  const t = useTheme();
  const router = useRouter();
  const Icon = kindIcon[item.kind];

  return (
    <Pressable
      // A locked item still opens *something* — the unlock screen directly,
      // rather than the item screen, which would just show the same prompt
      // one tap later. Free-preview items are never `isContentLocked`, so
      // they still open normally even in an unentitled course.
      onPress={
        item.isContentLocked
          ? () =>
              router.push({
                pathname: '/course/[courseId]/unlock',
                params: { courseId },
              })
          : onPress
      }
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.sm,
        paddingVertical: t.spacing.md,
        paddingHorizontal: t.spacing.md,
        borderRadius: t.radius.md,
        backgroundColor: pressed ? t.colors.muted : t.colors.card,
        borderWidth: 1,
        borderColor: t.colors.border,
      })}
    >
      {item.isDone ? (
        <CheckCircle2 size={16} color={t.colors.success} />
      ) : item.isContentLocked ? (
        <Lock size={16} color={t.colors.mutedForeground} />
      ) : (
        <Icon size={16} color={t.colors.mutedForeground} />
      )}
      <Text variant="label" style={{ flex: 1 }}>
        {item.title}
      </Text>
      <Text variant="caption" color="mutedForeground">
        {item.kind.charAt(0) + item.kind.slice(1).toLowerCase()}
      </Text>
    </Pressable>
  );
}
