/**
 * Shared UI kit: chunky glossy buttons, pills, stars and panels in the
 * style of a premium casual game (no default-looking controls).
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { UI } from '../data/cosmetics';
import { AudioManager } from '../managers/AudioManager';
import { Haptics } from '../managers/Haptics';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const SHADES: Record<string, [string, string, string]> = {
  green: ['#5ef0a8', '#22c27f', '#139360'],
  blue: ['#6db6ff', '#2f7bff', '#1d55c2'],
  pink: ['#ff8fb5', '#ff4f86', '#d12f63'],
  yellow: ['#ffe066', '#ffc21a', '#d99a00'],
  purple: ['#b79bff', '#7c5cff', '#5638d6'],
  white: ['#ffffff', '#eef0ff', '#c9cbe8'],
};
export type Shade = keyof typeof SHADES;

function usePressScale() {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.94, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start();
  return { scale, pressIn, pressOut };
}

export function GameButton({
  title,
  subtitle,
  icon,
  onPress,
  shade = 'green',
  size = 'md',
  style,
  disabled,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  onPress: () => void;
  shade?: Shade;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const { scale, pressIn, pressOut } = usePressScale();
  const [top, mid, edge] = SHADES[shade];
  const h = size === 'lg' ? 78 : size === 'md' ? 58 : 46;
  const fs = size === 'lg' ? 30 : size === 'md' ? 21 : 17;
  const padH = size === 'lg' ? 26 : size === 'md' ? 20 : 10;
  const textColor = shade === 'white' ? UI.ink : '#fff';
  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: disabled ? 0.5 : 1 }, style]}>
      <Pressable
        disabled={disabled}
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={() => {
          AudioManager.play('button');
          Haptics.selection();
          onPress();
        }}
      >
        <View style={[styles.btnEdge, { backgroundColor: edge, borderRadius: h / 2.4, paddingBottom: 6 }]}>
          <LinearGradient colors={[top, mid]} style={[styles.btnFace, { height: h, borderRadius: h / 2.4, paddingHorizontal: padH }]}>
            <View style={[styles.btnShine, { borderRadius: h / 2.4 }]} />
            <View style={styles.btnRow}>
              {icon && <Ionicons name={icon} size={size === 'sm' ? fs + 1 : fs + 4} color={textColor} style={{ marginRight: size === 'sm' ? 5 : 8 }} />}
              <View style={{ alignItems: 'center', flexShrink: 1 }}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.btnText, { fontSize: fs, color: textColor }]}>
                  {title}
                </Text>
                {subtitle ? (
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={[styles.btnSub, { color: textColor }]}>
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function IconButton({
  icon,
  onPress,
  shade = 'white',
  size = 48,
  style,
}: {
  icon: IconName;
  onPress: () => void;
  shade?: Shade;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { scale, pressIn, pressOut } = usePressScale();
  const [top, mid, edge] = SHADES[shade];
  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        hitSlop={8}
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={() => {
          AudioManager.play('button');
          Haptics.selection();
          onPress();
        }}
      >
        <View style={{ backgroundColor: edge, borderRadius: size / 2.6, paddingBottom: 4 }}>
          <LinearGradient
            colors={[top, mid]}
            style={{ width: size, height: size, borderRadius: size / 2.6, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name={icon} size={size * 0.52} color={shade === 'white' ? UI.ink : '#fff'} />
          </LinearGradient>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function CoinIcon({ size = 22 }: { size?: number }) {
  return (
    <LinearGradient
      colors={['#fff1a8', '#ffc21a', '#e69a00']}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff6c8' }}
    >
      <View style={{ width: size * 0.36, height: size * 0.36, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.55)', marginTop: -size * 0.15, marginLeft: -size * 0.15 }} />
    </LinearGradient>
  );
}

export function CoinPill({ coins, style }: { coins: number; style?: StyleProp<ViewStyle> }) {
  const bump = useRef(new Animated.Value(1)).current;
  const prev = useRef(coins);
  useEffect(() => {
    if (coins !== prev.current) {
      prev.current = coins;
      Animated.sequence([
        Animated.timing(bump, { toValue: 1.18, duration: 90, useNativeDriver: true }),
        Animated.spring(bump, { toValue: 1, useNativeDriver: true, bounciness: 12 }),
      ]).start();
    }
  }, [coins, bump]);
  return (
    <Animated.View style={[styles.pill, { transform: [{ scale: bump }] }, style]}>
      <CoinIcon />
      <Text style={styles.pillText}>{coins.toLocaleString()}</Text>
    </Animated.View>
  );
}

export function Stars({ count, size = 18, gap = 2 }: { count: number; size?: number; gap?: number }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {[0, 1, 2].map((i) => (
        <Ionicons
          key={i}
          name="star"
          size={size}
          color={i < count ? UI.gold : 'rgba(43,35,80,0.18)'}
          style={{ marginHorizontal: gap, textShadowColor: i < count ? '#c77d00' : 'transparent', textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 }}
        />
      ))}
    </View>
  );
}

/** Pop-in card used by every overlay (pause, victory, game over...). */
export function Panel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 9 }).start();
  }, [a]);
  return (
    <Animated.View
      style={[
        styles.panel,
        { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function Backdrop({ children }: { children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.quad) }).start();
  }, [a]);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: a }]}>
      {children}
    </Animated.View>
  );
}

const LOGO_IMAGE = require('../../assets/logo.png');
const LOGO_ASPECT = 1400 / 420;

/** The DROPLIO wordmark (drawn by tools/generate_logo.py) with a gentle bob. */
export function Logo({ width = 320 }: { width?: number }) {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
        Animated.timing(bob, { toValue: 0, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);
  return (
    <Animated.Image
      source={LOGO_IMAGE}
      resizeMode="contain"
      accessibilityLabel="Droplio"
      style={{
        width,
        height: width / LOGO_ASPECT,
        transform: [
          { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [-5, 5] }) },
          { rotate: bob.interpolate({ inputRange: [0, 1], outputRange: ['-1.5deg', '1.5deg'] }) },
        ],
      }}
    />
  );
}

export const styles = StyleSheet.create({
  btnEdge: {
    shadowColor: '#2b2350',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  btnFace: { justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  btnShine: {
    position: 'absolute',
    top: 4,
    left: 10,
    right: 10,
    height: '42%',
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: {
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  btnSub: { fontSize: 12, fontWeight: '800', opacity: 0.85, marginTop: -1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingLeft: 5,
    paddingRight: 14,
    height: 36,
    borderRadius: 18,
    shadowColor: '#2b2350',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  pillText: { marginLeft: 7, fontSize: 17, fontWeight: '900', color: UI.ink },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 24,
    alignItems: 'center',
    width: '86%',
    maxWidth: 380,
    shadowColor: '#2b2350',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  backdrop: { backgroundColor: 'rgba(43,35,80,0.45)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '900', color: UI.ink, textAlign: 'center' },
  body: { fontSize: 16, fontWeight: '600', color: UI.inkSoft, textAlign: 'center', lineHeight: 22 },
});
