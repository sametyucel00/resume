import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";

export const colors = {
  ink: "#0F172A",
  text: "#172033",
  muted: "#5B6B82",
  line: "#E2E8F0",
  bg: "#F8FAFC",
  accent: "#6366F1",
  accentDark: "#4F46E5",
  white: "#FFFFFF",
  soft: "#EEF2FF",
  danger: "#B91C1C",
  success: "#047857"
};

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Section({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.section, style]}>{children}</View>;
}

export function Title({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.titleWrap} accessibilityRole="header">
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={[styles.input, multiline && styles.textarea]}
      />
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.primaryButton,
        variant === "secondary" && styles.secondaryButton,
        variant === "ghost" && styles.ghostButton,
        pressed && { opacity: 0.82 },
        (disabled || loading) && { opacity: 0.5 }
      ]}
    >
      {loading ? <ActivityIndicator color={variant === "primary" ? colors.white : colors.accent} /> : <Text style={[styles.buttonText, variant === "primary" && styles.primaryButtonText]}>{label}</Text>}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityLabel={option.label}
          accessibilityState={{ selected: value === option.value }}
          onPress={() => onChange(option.value)}
          style={[styles.segment, value === option.value && styles.segmentActive]}
        >
          <Text style={[styles.segmentText, value === option.value && styles.segmentTextActive]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.aiDot} />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: lines }).map((_, index) => (
        <View key={index} style={[styles.skeleton, { width: `${95 - index * 12}%` }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  section: {
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  titleWrap: {
    gap: 6,
    marginBottom: 12
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21
  },
  fieldWrap: {
    gap: 7,
    marginBottom: 12
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.white,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 15
  },
  textarea: {
    minHeight: 120,
    paddingTop: 10,
    lineHeight: 21
  },
  button: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    width: "100%"
  },
  primaryButton: {
    backgroundColor: colors.ink
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white
  },
  ghostButton: {
    backgroundColor: "transparent"
  },
  buttonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700"
  },
  primaryButtonText: {
    color: colors.white
  },
  segmented: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    borderRadius: 8,
    padding: 2,
    gap: 3
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    paddingHorizontal: 8
  },
  segmentActive: {
    backgroundColor: colors.soft
  },
  segmentText: {
    color: colors.muted,
    fontWeight: "700",
    fontSize: 13
  },
  segmentTextActive: {
    color: colors.accentDark
  },
  empty: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 30
  },
  aiDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    backgroundColor: colors.accent
  },
  emptyText: {
    color: colors.muted,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 320
  },
  skeletonWrap: {
    gap: 10,
    paddingVertical: 14
  },
  skeleton: {
    height: 14,
    borderRadius: 6,
    backgroundColor: "#E5E7EB"
  }
});
