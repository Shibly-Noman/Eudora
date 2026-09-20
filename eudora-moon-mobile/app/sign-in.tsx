import { Link, router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoonBackdrop } from '@/components/MoonBackdrop';
import { useSession } from '@/session';
import { moon } from '@/theme';

export default function SignIn() {
  const { tokens, signIn } = useSession();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [visiblePassword, setVisiblePassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => { if (tokens) router.replace('/library'); }, [tokens]);
  const submit = async () => {
    setError(null); setBusy(true);
    try { await signIn(email.trim(), password); router.replace('/library'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'We could not sign you in. Please try again.'); }
    finally { setBusy(false); }
  };

  return (
    <MoonBackdrop variant="login">
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding' })} style={[styles.page, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.brand}><Text style={styles.kicker}>EUDORA MOON</Text><Text style={styles.brandLine}>A little time for stories.</Text></View>
        <View style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.copy}>Pick up a story, right where you left it.</Text>
          <Text style={styles.label}>Email</Text>
          <TextInput accessibilityLabel="Email address" autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="you@example.com" placeholderTextColor="#817996" style={styles.input} value={email} onChangeText={setEmail} editable={!busy} />
          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow}><TextInput accessibilityLabel="Password" autoComplete="current-password" secureTextEntry={!visiblePassword} placeholder="Your password" placeholderTextColor="#817996" style={styles.passwordInput} value={password} onChangeText={setPassword} editable={!busy} /><Pressable accessibilityRole="button" accessibilityLabel={visiblePassword ? 'Hide password' : 'Show password'} onPress={() => setVisiblePassword((value) => !value)} style={styles.showButton}><Text style={styles.showText}>{visiblePassword ? 'Hide' : 'Show'}</Text></Pressable></View>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Sign in" disabled={!email || !password || busy} onPress={() => void submit()} style={({ pressed }) => [styles.primaryButton, (!email || !password || busy) && styles.disabled, pressed && styles.pressed]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Enter story library</Text>}</Pressable>
          <Text style={styles.footer}>New to Eudora Moon? <Link href="/sign-up" style={styles.footerLink}>Create an account</Link></Text>
        </View>
      </KeyboardAvoidingView>
    </MoonBackdrop>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 20, gap: 18 }, brand: { paddingHorizontal: 8 },
  kicker: { color: '#FFF5C5', fontFamily: moon.fonts.bodyBold, letterSpacing: 2.4, fontSize: 12 }, brandLine: { color: '#FFFFFF', fontFamily: moon.fonts.displayBold, fontSize: 29, lineHeight: 35, marginTop: 7, textShadowColor: 'rgba(22,14,66,0.32)', textShadowRadius: 8 },
  card: { borderRadius: 30, backgroundColor: 'rgba(255,254,250,0.96)', padding: 24, shadowColor: '#201744', shadowOpacity: 0.28, shadowRadius: 22, shadowOffset: { width: 0, height: 11 }, elevation: 7 }, title: { color: moon.colors.ink, fontFamily: moon.fonts.displayExtraBold, fontSize: 29, lineHeight: 34 }, copy: { color: moon.colors.muted, fontFamily: moon.fonts.body, fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 20 },
  label: { color: moon.colors.ink, fontFamily: moon.fonts.bodyBold, fontSize: 12, marginBottom: 7 }, input: { height: 52, borderWidth: 1, borderColor: '#DED7E8', borderRadius: 15, paddingHorizontal: 15, fontFamily: moon.fonts.body, fontSize: 15, color: moon.colors.ink, backgroundColor: '#FFFFFF', marginBottom: 15 }, passwordRow: { height: 52, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#DED7E8', borderRadius: 15, backgroundColor: '#FFFFFF', marginBottom: 8 }, passwordInput: { flex: 1, alignSelf: 'stretch', paddingHorizontal: 15, fontFamily: moon.fonts.body, fontSize: 15, color: moon.colors.ink }, showButton: { paddingHorizontal: 14, alignSelf: 'stretch', justifyContent: 'center' }, showText: { color: '#695AA5', fontFamily: moon.fonts.bodyBold, fontSize: 12 },
  primaryButton: { height: 54, justifyContent: 'center', alignItems: 'center', borderRadius: 17, backgroundColor: moon.colors.primary, marginTop: 12, shadowColor: '#FF7D3D', shadowOpacity: 0.38, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 }, primaryButtonText: { color: '#FFFFFF', fontFamily: moon.fonts.bodyBold, fontSize: 15 }, footer: { color: moon.colors.muted, fontFamily: moon.fonts.body, textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 18 }, footerLink: { color: '#6753B4', fontFamily: moon.fonts.bodyBold }, error: { color: moon.colors.danger, fontFamily: moon.fonts.bodySemiBold, fontSize: 12, lineHeight: 18, marginTop: 2 }, disabled: { opacity: 0.48 }, pressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
});
