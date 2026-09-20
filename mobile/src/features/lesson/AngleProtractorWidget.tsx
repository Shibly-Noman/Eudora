import Slider from '@react-native-community/slider';
import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { Text } from '@/ui/primitives/Text';
import { useTheme } from '@/ui/theme/ThemeProvider';

export type AngleProtractorValue = { angle: number };

interface AngleProtractorWidgetProps {
  value: AngleProtractorValue | null;
  onChange: (value: AngleProtractorValue) => void;
  locked: boolean;
  isCorrect?: boolean;
  /** Only present after an incorrect submission — mirrors web's reveal rule. */
  correctReveal?: { correctAngle: number; classification: string | null };
}

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 85;

// SVG y grows downward, so subtracting sin() turns "increasing angle" into
// the counter-clockwise sweep a protractor reads — same convention as web's
// AngleProtractorWidget, which this mirrors visually.
function rayEndpoint(angleDegrees: number) {
  const rad = (angleDegrees * Math.PI) / 180;
  return {
    x: CENTER + RADIUS * Math.cos(rad),
    y: CENTER - RADIUS * Math.sin(rad),
  };
}

/**
 * One ray fixed at the baseline (0°), the other set by a slider (phone) or
 * D-pad stepper (TV) — never by a hand-rolled SVG drag, the same reasoning
 * as web's AngleProtractorWidget: a free two-ray drag would make the same
 * relative angle correct at any orientation, and `@react-native-community/
 * slider` has no D-pad affordance at all (see SliderWidget.tsx's TvStepper,
 * which this reuses the same split for).
 */
export function AngleProtractorWidget({
  value,
  onChange,
  locked,
  isCorrect,
  correctReveal,
}: AngleProtractorWidgetProps) {
  const t = useTheme();
  const angle = value?.angle ?? 90;
  const showReveal = locked && isCorrect === false && !!correctReveal;

  const setAngle = (next: number) => {
    if (locked) return;
    onChange({ angle: ((next % 360) + 360) % 360 });
  };

  const tip = rayEndpoint(angle);
  const revealTip = showReveal ? rayEndpoint(correctReveal!.correctAngle) : null;

  return (
    <View
      style={{
        padding: t.spacing.xl,
        borderRadius: t.radius.xl,
        borderWidth: 1,
        borderColor: t.colors.border,
        backgroundColor: t.colors.card,
        alignItems: 'center',
        gap: t.spacing.md,
      }}
    >
      <Text variant="caption" color="mutedForeground">
        {locked
          ? isCorrect
            ? 'Correct!'
            : 'Incorrect'
          : 'Drag the slider to set the angle'}
      </Text>

      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke={t.colors.border}
          strokeWidth={1}
          strokeDasharray="3,3"
        />

        {/* Fixed baseline ray (0°) */}
        <Line
          x1={CENTER}
          y1={CENTER}
          x2={CENTER + RADIUS}
          y2={CENTER}
          stroke={t.colors.mutedForeground}
          strokeWidth={2}
        />

        {revealTip ? (
          <Line
            x1={CENTER}
            y1={CENTER}
            x2={revealTip.x}
            y2={revealTip.y}
            stroke={t.colors.success}
            strokeWidth={2}
            strokeDasharray="4,3"
          />
        ) : null}

        <Line
          x1={CENTER}
          y1={CENTER}
          x2={tip.x}
          y2={tip.y}
          stroke={locked ? (isCorrect ? t.colors.success : t.colors.destructive) : t.colors.primary}
          strokeWidth={3}
        />
        <Circle
          cx={tip.x}
          cy={tip.y}
          r={6}
          fill={locked ? (isCorrect ? t.colors.success : t.colors.destructive) : t.colors.primary}
        />
        <Circle cx={CENTER} cy={CENTER} r={4} fill={t.colors.foreground} />
      </Svg>

      <View
        style={{
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.xs,
          borderRadius: t.radius.pill,
          backgroundColor: t.colors.primary,
        }}
      >
        <Text variant="label" style={{ color: t.colors.primaryForeground }}>
          {Math.round(angle)}°
        </Text>
      </View>

      {Platform.isTV ? (
        <AngleTvStepper value={angle} onChange={setAngle} locked={locked} />
      ) : (
        <Slider
          style={{ width: '100%', height: 40 }}
          minimumValue={0}
          maximumValue={359}
          step={1}
          value={angle}
          onValueChange={setAngle}
          disabled={locked}
          minimumTrackTintColor={t.colors.primary}
          maximumTrackTintColor={t.colors.muted}
          thumbTintColor={t.colors.primary}
        />
      )}

      {showReveal && correctReveal ? (
        <Text variant="caption" color="success">
          {`Correct angle: ${correctReveal.correctAngle}°${
            correctReveal.classification ? ` (${correctReveal.classification})` : ''
          }`}
        </Text>
      ) : null}
    </View>
  );
}

function AngleTvStepper({
  value,
  onChange,
  locked,
}: {
  value: number;
  onChange: (value: number) => void;
  locked: boolean;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState<'decrement' | 'increment' | null>(null);

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: t.spacing.xl }}>
      <TvStepButton
        label="−"
        disabled={locked}
        focused={focused === 'decrement'}
        onFocus={() => setFocused('decrement')}
        onBlur={() => setFocused((c) => (c === 'decrement' ? null : c))}
        onPress={() => onChange(value - 1)}
      />
      <TvStepButton
        label="+"
        disabled={locked}
        focused={focused === 'increment'}
        onFocus={() => setFocused('increment')}
        onBlur={() => setFocused((c) => (c === 'increment' ? null : c))}
        onPress={() => onChange(value + 1)}
      />
    </View>
  );
}

function TvStepButton({
  label,
  disabled,
  focused,
  onFocus,
  onBlur,
  onPress,
}: {
  label: string;
  disabled: boolean;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      disabled={disabled}
      focusable={!disabled}
      onFocus={onFocus}
      onBlur={onBlur}
      onPress={onPress}
      accessibilityRole="adjustable"
      style={{
        width: 56,
        height: 56,
        borderRadius: t.radius.pill,
        borderWidth: 2,
        borderColor: focused ? t.colors.primary : t.colors.border,
        backgroundColor: t.colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text variant="title" color={focused ? 'primary' : 'foreground'}>
        {label}
      </Text>
    </Pressable>
  );
}
