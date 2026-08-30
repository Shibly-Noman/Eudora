import { useRouter } from 'expo-router';
import { ArrowLeftRight, Award, BookHeadphones, BookOpen, ClipboardCheck, ClipboardList, Flame, Gem, Settings, Star, Trophy } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CourseSummary } from '@/core/contracts';
import { useGetMeQuery } from '@/features/auth/authApi';
import { useGetCoursesQuery } from '@/features/catalog/catalogApi';
import { useGetGamificationMeQuery } from '@/features/gamification/gamificationApi';
import { useActingChild } from '@/features/guardian/useActingChild';
import { useGetPendingHomeworkQuery } from '@/features/homework/homeworkApi';
import { TodaysGoals } from '@/features/gamification/TodaysGoals';
import { Card } from '@/ui/primitives/Card';
import { ProgressBar } from '@/ui/primitives/ProgressBar';
import { Text } from '@/ui/primitives/Text';
import { useTheme } from '@/ui/theme/ThemeProvider';

interface StudentHomeScreenProps {
  /**
   * Passed by `app/index.tsx` when a guardian is viewing a child's learning
   * surface, to get back to the family portal. Absent for a student account,
   * which has nothing to switch to.
   */
  onExitChildView?: () => void;
}

/**
 * The learner surface — for a student viewing their own account, and for a
 * guardian viewing one child's.
 *
 * Every query here is about one learner, and which learner is decided by
 * `useActingChild`: the caller's own profile for a student, the selected child
 * for a guardian. The queries carry `actingChildId` in their arguments as well
 * as (via baseQuery) the header, so switching child produces a different cache
 * entry rather than re-rendering the sibling's data.
 */
export function StudentHomeScreen({ onExitChildView }: StudentHomeScreenProps = {}) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: me } = useGetMeQuery();
  const { actingChildId, learnerId, activeChild } = useActingChild();
  const {
    data: gamification,
    isLoading: loadingXp,
    refetch: refetchXp,
    isFetching,
  } = useGetGamificationMeQuery({ actingChildId }, { skip: !learnerId });
  const { data: courses, refetch: refetchCourses } = useGetCoursesQuery({
    actingChildId,
  });
  const { data: pendingHomework } = useGetPendingHomeworkQuery(learnerId!, {
    skip: !learnerId,
  });

  // Courses a guardian put in this student's learning plan. Surfaced as a
  // separate strip rather than filtering the main list — an assignment is a
  // recommendation, so every course stays reachable either way.
  const assignedCourses = (courses ?? []).filter((course) => course.isAssigned);

  const xp = gamification?.experience;
  const streak = gamification?.streak;
  const levelProgress =
    xp && xp.nextLevelXp > 0 ? (xp.totalXp % xp.nextLevelXp) / xp.nextLevelXp : 0;

  if (loadingXp) {
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.colors.background }}
      contentContainerStyle={{
        padding: t.spacing.xl,
        paddingTop: insets.top + t.spacing.lg,
        paddingBottom: insets.bottom + t.spacing.xxl,
      }}
      refreshControl={
        <RefreshControl
          refreshing={isFetching}
          onRefresh={() => {
            void refetchXp();
            void refetchCourses();
          }}
          tintColor={t.colors.primary}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View>
          <Text variant="caption" color="mutedForeground">
            {activeChild ? 'Viewing' : greeting()}
          </Text>
          <Text variant="title">
            {activeChild?.fullName || me?.firstName || me?.email || 'Learner'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
          {onExitChildView ? (
            <Pressable
              onPress={onExitChildView}
              accessibilityRole="button"
              accessibilityLabel="Back to family portal"
              hitSlop={8}
            >
              <ArrowLeftRight size={22} color={t.colors.mutedForeground} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
          >
            <Settings size={22} color={t.colors.mutedForeground} />
          </Pressable>
        </View>
      </View>

      <View style={{ height: t.spacing.xl }} />

      {/* Streak / XP / level */}
      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <StatTile
          icon={<Flame size={20} color={t.colors.warning} />}
          value={String(streak?.currentStreak ?? 0)}
          label="day streak"
        />
        <StatTile
          icon={<Star size={20} color={t.colors.primary} />}
          value={String(xp?.totalXp ?? 0)}
          label="total XP"
        />
        <StatTile
          icon={<Gem size={20} color={t.colors.success} />}
          value={String(xp?.level ?? 1)}
          label="level"
        />
      </View>

      <View style={{ height: t.spacing.lg }} />

      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <Pressable
          onPress={() => router.push('/badges')}
          accessibilityRole="button"
          style={{ flex: 1 }}
        >
          <Card
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
          >
            <Award size={18} color={t.colors.primary} />
            <Text variant="label">Badges</Text>
          </Card>
        </Pressable>
        <Pressable
          onPress={() => router.push('/leaderboard')}
          accessibilityRole="button"
          style={{ flex: 1 }}
        >
          <Card
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
          >
            <Trophy size={18} color={t.colors.primary} />
            <Text variant="label">Leaderboard</Text>
          </Card>
        </Pressable>
      </View>

      <View style={{ height: t.spacing.md }} />

      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <Pressable onPress={() => router.push('/homework')} accessibilityRole="button" style={{ flex: 1 }}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <ClipboardList size={18} color={t.colors.primary} />
            <Text variant="label" style={{ flex: 1 }}>
              Homework
            </Text>
            {pendingHomework && pendingHomework.length > 0 ? (
              <View
                style={{
                  minWidth: 20,
                  height: 20,
                  borderRadius: t.radius.pill,
                  backgroundColor: t.colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 6,
                }}
              >
                <Text variant="caption" style={{ color: t.colors.primaryForeground }}>
                  {pendingHomework.length}
                </Text>
              </View>
            ) : null}
          </Card>
        </Pressable>
      </View>

      <View style={{ height: t.spacing.md }} />

      <View style={{ flexDirection: 'row', gap: t.spacing.md }}>
        <Pressable
          onPress={() => router.push('/assessments')}
          accessibilityRole="button"
          style={{ flex: 1 }}
        >
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <ClipboardCheck size={18} color={t.colors.primary} />
            <Text variant="label">Assessments</Text>
          </Card>
        </Pressable>
        {/*
          The one tile here that does not depend on owning a course — published
          stories are free — so it stays visible for a family that has bought
          nothing yet, which is exactly who has least to tap otherwise.
        */}
        <Pressable
          onPress={() => router.push('/story-library')}
          accessibilityRole="button"
          style={{ flex: 1 }}
        >
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <BookHeadphones size={18} color={t.colors.primary} />
            <Text variant="label" style={{ flex: 1 }}>
              Stories
            </Text>
          </Card>
        </Pressable>
      </View>

      <View style={{ height: t.spacing.lg }} />

      <Card>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginBottom: t.spacing.sm,
          }}
        >
          <Text variant="label">Level {xp?.level ?? 1}</Text>
          <Text variant="caption" color="mutedForeground">
            {xp?.totalXp ?? 0} / {xp?.nextLevelXp ?? 100} XP
          </Text>
        </View>
        <ProgressBar value={levelProgress} />
      </Card>

      <View style={{ height: t.spacing.xl }} />

      <TodaysGoals />

      <View style={{ height: t.spacing.xl }} />

      {assignedCourses.length > 0 ? (
        <>
          <Text variant="heading">Chosen for you</Text>
          <View style={{ height: t.spacing.xs }} />
          <Text variant="caption" color="mutedForeground">
            Picked by your family
          </Text>
          <View style={{ height: t.spacing.md }} />
          <CourseRow
            courses={assignedCourses}
            onSelect={(id) => router.push(`/course/${id}`)}
          />
          <View style={{ height: t.spacing.xl }} />
        </>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="heading">Your courses</Text>
        <Pressable onPress={() => router.push('/course')} accessibilityRole="button" hitSlop={8}>
          <Text variant="caption" color="primary">
            Browse all
          </Text>
        </Pressable>
      </View>
      <View style={{ height: t.spacing.md }} />

      {courses && courses.length > 0 ? (
        <CourseRow courses={courses} onSelect={(id) => router.push(`/course/${id}`)} />
      ) : (
        <Card>
          <Text variant="body" color="mutedForeground">
            No courses are available yet.
          </Text>
        </Card>
      )}
    </ScrollView>
  );
}

/** Horizontal strip of course cards — shared by "Chosen for you" and "Your courses". */
function CourseRow({
  courses,
  onSelect,
}: {
  courses: CourseSummary[];
  onSelect: (courseId: string) => void;
}) {
  const t = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: t.spacing.md, paddingRight: t.spacing.xl }}
    >
      {courses.map((course) => (
        <Pressable
          key={course.id}
          onPress={() => onSelect(course.id)}
          accessibilityRole="button"
        >
          <Card style={{ width: 200 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: t.radius.md,
                backgroundColor: t.colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BookOpen size={22} color={t.colors.accentForeground} />
            </View>
            <View style={{ height: t.spacing.sm }} />
            <Text variant="label" numberOfLines={2}>
              {course.title}
            </Text>
            <Text variant="caption" color="mutedForeground" numberOfLines={1}>
              {course.learningSubject.name} · {course._count.concepts} chapters
            </Text>
            {course.gradeBand ? (
              <>
                <View style={{ height: t.spacing.sm }} />
                <View
                  style={{
                    alignSelf: 'flex-start',
                    paddingHorizontal: t.spacing.sm,
                    paddingVertical: 2,
                    borderRadius: t.radius.pill,
                    backgroundColor: t.colors.muted,
                  }}
                >
                  <Text variant="caption" color="mutedForeground">
                    {GRADE_BAND_LABELS[course.gradeBand]}
                  </Text>
                </View>
              </>
            ) : null}
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const GRADE_BAND_LABELS: Record<string, string> = {
  PRE_K_K: 'Pre-K/K',
  G1_2: 'Grades 1-2',
  G3_4: 'Grades 3-4',
  G5_6: 'Grades 5-6',
};

function StatTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, alignItems: 'center', paddingVertical: t.spacing.lg }}>
      {icon}
      <Text variant="heading" style={{ marginTop: t.spacing.xs }}>
        {value}
      </Text>
      <Text variant="caption" color="mutedForeground" numberOfLines={1}>
        {label}
      </Text>
    </Card>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
