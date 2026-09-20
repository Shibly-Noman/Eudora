import { Link, router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoonBackdrop } from '@/components/MoonBackdrop';
import { useSession } from '@/session';
import { moon } from '@/theme';

export default function SignUp() {
  const { tokens, register } = useSession();
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = React.useState(''); const [lastName, setLastName] = React.useState('');
  const [email, setEmail] = React.useState(''); const [password, setPassword] = React.useState(''); const [confirmation, setConfirmation] = React.useState('');
  const [visiblePassword, setVisiblePassword] = React.useState(false); const [error, setError] = React.useState<string | null>(null); const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { if (tokens) router.replace('/library'); }, [tokens]);
  const submit = async () => {
    const trimmedEmail = email.trim();
    if (!firstName.trim() || !lastName.trim() || !trimmedEmail) { setError('Please complete your name and email address.'); return; }
    if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) { setError('Use at least 10 characters with uppercase, lowercase, and a number.'); return; }
    if (password !== confirmation) { setError('Your passwords do not match.'); return; }
    setError(null); setBusy(true);
    try { await register({ firstName: firstName.trim(), lastName: lastName.trim(), email: trimmedEmail, password }); router.replace('/library'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'We could not create your account. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <MoonBackdrop>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding' })} style={styles.keyboard}>
        <ScrollView contentContainerStyle={[styles.page, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}><Text style={styles.kicker}>EUDORA MOON</Text><Text style={styles.brandLine}>Let stories light the way.</Text></View>
          <View style={styles.card}>
            <Text style={styles.title}>Create your reader account</Text><Text style={styles.copy}>Save your place and return whenever story time calls.</Text>
            <View style={styles.nameRow}><Field label="First name" value={firstName} onChangeText={setFirstName} placeholder="First name" autoComplete="given-name" style={styles.halfField} /><Field label="Last name" value={lastName} onChangeText={setLastName} placeholder="Last name" autoComplete="family-name" style={styles.halfField} /></View>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoComplete="email" keyboardType="email-address" autoCapitalize="none" />
            <Text style={styles.label}>Password</Text><View style={styles.passwordRow}><TextInput accessibilityLabel="Password" secureTextEntry={!visiblePassword} autoComplete="new-password" placeholder="Create a password" placeholderTextColor="#817996" style={styles.passwordInput} value={password} onChangeText={setPassword} editable={!busy} /><Pressable accessibilityRole="button" accessibilityLabel={visiblePassword ? 'Hide password' : 'Show password'} onPress={() => setVisiblePassword((value) => !value)} style={styles.showButton}><Text style={styles.showText}>{visiblePassword ? 'Hide' : 'Show'}</Text></Pressable></View>
            <Field label="Confirm password" value={confirmation} onChangeText={setConfirmation} placeholder="Repeat your password" autoComplete="new-password" secureTextEntry={!visiblePassword} />
            <Text style={styles.passwordHelp}>10+ characters, including uppercase, lowercase, and a number.</Text>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Create account" disabled={busy} onPress={() => void submit()} style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && styles.pressed]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create my account</Text>}</Pressable>
            <Text style={styles.footer}>Already have an account? <Link href="/sign-in" style={styles.footerLink}>Sign in</Link></Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </MoonBackdrop>
  );
}

function Field({ label, style, ...props }: { label: string; style?: StyleProp<ViewStyle> } & Omit<React.ComponentProps<typeof TextInput>, 'style'>) {
  return <View style={style}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#817996" style={styles.input} editable={props.editable ?? true} {...props} /></View>;
}

const styles = StyleSheet.create({
  keyboard: { flex: 1 }, page: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 20, gap: 18 }, brand: { paddingHorizontal: 8, marginTop: 20 }, kicker: { color: '#FFF5C5', fontFamily: moon.fonts.bodyBold, letterSpacing: 2.4, fontSize: 12 }, brandLine: { color: '#FFFFFF', fontFamily: moon.fonts.displayBold, fontSize: 27, lineHeight: 33, marginTop: 7 },
  card: { borderRadius: 30, backgroundColor: 'rgba(255,254,250,0.96)', padding: 23, shadowColor: '#201744', shadowOpacity: 0.28, shadowRadius: 22, shadowOffset: { width: 0, height: 11 }, elevation: 7 }, title: { color: moon.colors.ink, fontFamily: moon.fonts.displayExtraBold, fontSize: 26, lineHeight: 31 }, copy: { color: moon.colors.muted, fontFamily: moon.fonts.body, fontSize: 14, lineHeight: 20, marginTop: 7, marginBottom: 18 },
  nameRow: { flexDirection: 'row', gap: 10 }, halfField: { flex: 1 }, label: { color: moon.colors.ink, fontFamily: moon.fonts.bodyBold, fontSize: 12, marginBottom: 7 }, input: { height: 50, borderWidth: 1, borderColor: '#DED7E8', borderRadius: 15, paddingHorizontal: 14, fontFamily: moon.fonts.body, fontSize: 14, color: moon.colors.ink, backgroundColor: '#FFFFFF', marginBottom: 14 }, passwordRow: { height: 50, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#DED7E8', borderRadius: 15, backgroundColor: '#FFFFFF', marginBottom: 14 }, passwordInput: { flex: 1, alignSelf: 'stretch', paddingHorizontal: 14, fontFamily: moon.fonts.body, fontSize: 14, color: moon.colors.ink }, showButton: { paddingHorizontal: 14, alignSelf: 'stretch', justifyContent: 'center' }, showText: { color: '#695AA5', fontFamily: moon.fonts.bodyBold, fontSize: 12 }, passwordHelp: { color: moon.colors.muted, fontFamily: moon.fonts.body, fontSize: 11, lineHeight: 16, marginTop: -6 },
  primaryButton: { height: 54, justifyContent: 'center', alignItems: 'center', borderRadius: 17, backgroundColor: moon.colors.primary, marginTop: 16, shadowColor: '#FF7D3D', shadowOpacity: 0.38, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 }, primaryButtonText: { color: '#FFFFFF', fontFamily: moon.fonts.bodyBold, fontSize: 15 }, footer: { color: moon.colors.muted, fontFamily: moon.fonts.body, textAlign: 'center', fontSize: 12, lineHeight: 18, marginTop: 17 }, footerLink: { color: '#6753B4', fontFamily: moon.fonts.bodyBold }, error: { color: moon.colors.danger, fontFamily: moon.fonts.bodySemiBold, fontSize: 12, lineHeight: 18, marginTop: 8 }, disabled: { opacity: 0.48 }, pressed: { transform: [{ scale: 0.99 }], opacity: 0.9 },
});
