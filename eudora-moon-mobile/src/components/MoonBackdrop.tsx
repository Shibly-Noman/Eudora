import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';

import { moon } from '@/theme';

/** Shared auth and launch backdrop; later motion can animate these layers without changing screen layout. */
export function MoonBackdrop({ children, variant = 'default' }: { children: ReactNode; variant?: 'default' | 'login' }) {
  if (variant === 'login') {
    return (
      <ImageBackground source={require('../../assets/login.jpg')} resizeMode="cover" style={styles.root}>
        <View pointerEvents="none" style={styles.loginScrim} />
        <View style={styles.content}>{children}</View>
      </ImageBackground>
    );
  }

  return (
    <LinearGradient colors={['#30256F', '#55469A', '#C58BC2', '#FFD6A7']} locations={[0, 0.38, 0.73, 1]} style={styles.root}>
      <View pointerEvents="none" style={styles.moon}><View style={styles.moonShade} /></View>
      <View pointerEvents="none" style={styles.cloudOne} />
      <View pointerEvents="none" style={styles.cloudTwo} />
      <Text pointerEvents="none" style={[styles.star, styles.starOne]}>✦</Text>
      <Text pointerEvents="none" style={[styles.star, styles.starTwo]}>✧</Text>
      <Text pointerEvents="none" style={[styles.star, styles.starThree]}>✦</Text>
      <View style={styles.content}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  content: { flex: 1 },
  loginScrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(12, 8, 39, 0.3)' },
  moon: { position: 'absolute', width: 210, height: 210, borderRadius: 105, top: -58, right: -42, backgroundColor: '#FFF0B6', opacity: 0.95 },
  moonShade: { position: 'absolute', width: 178, height: 178, borderRadius: 89, left: 45, top: -12, backgroundColor: '#D9A1C8' },
  cloudOne: { position: 'absolute', width: 240, height: 92, borderRadius: 50, left: -70, top: '39%', backgroundColor: 'rgba(255,255,255,0.13)' },
  cloudTwo: { position: 'absolute', width: 290, height: 120, borderRadius: 65, right: -95, bottom: '8%', backgroundColor: 'rgba(34,24,83,0.13)' },
  star: { position: 'absolute', color: '#FFF5C5', fontFamily: moon.fonts.displayBold, textShadowColor: 'rgba(255,255,255,0.38)', textShadowRadius: 12 },
  starOne: { top: '18%', left: '14%', fontSize: 22 },
  starTwo: { top: '31%', right: '21%', fontSize: 18 },
  starThree: { bottom: '21%', left: '18%', fontSize: 14 },
});
