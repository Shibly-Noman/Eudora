import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { MoonBackdrop } from '@/components/MoonBackdrop';
import { useSession } from '@/session';
import { moon } from '@/theme';

export default function Index() {
  const { tokens, loading } = useSession();
  const [minimumTimeElapsed, setMinimumTimeElapsed] = React.useState(false);
  React.useEffect(() => {
    const timer = setTimeout(() => setMinimumTimeElapsed(true), 900);
    return () => clearTimeout(timer);
  }, []);
  if (loading || !minimumTimeElapsed) return <MoonSplash />;
  return <Redirect href={tokens ? '/library' : '/sign-in'} />;
}

function MoonSplash() {
  return (
    <MoonBackdrop>
      <View style={styles.content}>
        <View style={styles.mark}><Text style={styles.markMoon}>☾</Text><Text style={styles.markStar}>✦</Text></View>
        <Text style={styles.wordmark}>Eudora Moon</Text>
        <Text style={styles.tagline}>Stories that glow after dark.</Text>
        <ActivityIndicator color="#FFF7D1" style={styles.loader} />
      </View>
    </MoonBackdrop>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 34 },
  mark: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,247,209,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)' },
  markMoon: { color: '#FFF0B6', fontFamily: moon.fonts.displayBold, fontSize: 72, lineHeight: 82, marginTop: -7 }, markStar: { position: 'absolute', color: '#FFFFFF', fontFamily: moon.fonts.displayBold, fontSize: 22, right: 17, top: 17 },
  wordmark: { color: '#FFFFFF', fontFamily: moon.fonts.displayExtraBold, fontSize: 35, marginTop: 22, textShadowColor: 'rgba(26,14,66,0.35)', textShadowRadius: 10 }, tagline: { color: '#FFF5D8', fontFamily: moon.fonts.bodySemiBold, fontSize: 14, marginTop: 7 }, loader: { marginTop: 42 },
});
