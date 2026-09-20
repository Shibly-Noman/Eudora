import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLoginMutation } from '@/features/auth/authApi';
import { Button } from '@/ui/primitives/Button';
import { Text } from '@/ui/primitives/Text';
import { useTheme } from '@/ui/theme/ThemeProvider';

export default function LoginScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [login, { isLoading }] = useLoginMutation();

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setError('');
    try {
      await login({ email: email.trim(), password }).unwrap();
      router.replace('/');
    } catch (err: any) {
      setError(err?.data?.message || 'Could not sign in. Please try again.');
    }
  };

  const inputStyle = {
    backgroundColor: t.colors.card,
    borderColor: t.colors.border,
    borderWidth: 1,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.spacing.lg,
    paddingVertical: t.spacing.lg,
    fontSize: t.fontSize.md,
    color: t.colors.foreground,
    minHeight: 52,
  };

  return (
    <ImageBackground
      source={require('../assets/images/login-story-moon.png')}
      resizeMode="cover"
      style={{ flex: 1, backgroundColor: t.colors.background }}
    >
      <View
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFill,
          backgroundColor: 'rgba(10, 10, 10, 0.5)',
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: t.spacing.xl,
            paddingTop: insets.top + t.spacing.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
        <Text variant="display" style={{ marginBottom: t.spacing.xs }}>
          Eudora
        </Text>
        <Text variant="body" color="mutedForeground">
          Sign in to keep your streak going.
        </Text>

        <View style={{ height: t.spacing.xxl }} />

        <Text variant="label" color="mutedForeground">
          Email
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={t.colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          style={[inputStyle, { marginTop: t.spacing.sm }]}
        />

        <View style={{ height: t.spacing.lg }} />

        <Text variant="label" color="mutedForeground">
          Password
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={t.colors.mutedForeground}
          secureTextEntry
          autoCapitalize="none"
          textContentType="password"
          onSubmitEditing={handleSubmit}
          returnKeyType="go"
          style={[inputStyle, { marginTop: t.spacing.sm }]}
        />

        {error ? (
          <View
            style={{
              marginTop: t.spacing.lg,
              padding: t.spacing.md,
              borderRadius: t.radius.md,
              backgroundColor: t.colors.destructive + '1a',
            }}
          >
            <Text variant="label" color="destructive">
              {error}
            </Text>
          </View>
        ) : null}

        <View style={{ height: t.spacing.xl }} />

        <Button
          title="Sign in"
          onPress={handleSubmit}
          loading={isLoading}
          fullWidth
        />

        <View style={{ height: t.spacing.lg }} />

        {/* `replace`, not `push`, on both this and register's reciprocal link:
            login and register are alternate entry points into the same
            unauthenticated state, not a forward-progressing flow, so toggling
            between them repeatedly should not grow the navigation stack. */}
        <Pressable
          onPress={() => router.replace('/register')}
          accessibilityRole="button"
          style={{ alignSelf: 'center' }}
        >
          <Text variant="label" color="mutedForeground">
            New here? <Text variant="label" color="primary">Create an account</Text>
          </Text>
        </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}
