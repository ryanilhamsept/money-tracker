import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import { getStoredPin, savePin, removePin } from "../utils/pinStorage";

const PIN_LENGTH = 6;
const KEYPAD_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "back"],
];

// mode: "unlock" (buka app pake PIN yang udah ada) | "setup" (bikin PIN baru,
// dipanggil juga buat verifikasi PIN lama sebelum ganti/matiin).
export default function PinLockScreen({ mode, onSuccess, onCancel }) {
  const [stage, setStage] = useState(
    mode === "setup" ? "verifyOld" : mode === "create" ? "create" : "enter"
  );
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [error, setError] = useState("");
  const [isChecking, setIsChecking] = useState(false);

  const title = {
    verifyOld: "Masukkan PIN Saat Ini",
    enter: "Masukkan PIN",
    create: "Buat PIN Baru (6 digit)",
    confirm: "Ulangi PIN Baru",
    manage: "Kelola PIN",
  }[stage];

  const resetInput = () => setPin("");

  const handleComplete = async (value) => {
    setError("");

    if (stage === "enter") {
      setIsChecking(true);
      const stored = await getStoredPin();
      setIsChecking(false);
      if (value === stored) {
        onSuccess();
      } else {
        setError("PIN salah, coba lagi.");
        resetInput();
      }
      return;
    }

    if (stage === "verifyOld") {
      setIsChecking(true);
      const stored = await getStoredPin();
      setIsChecking(false);
      if (value === stored) {
        setStage("manage");
        resetInput();
      } else {
        setError("PIN salah.");
        resetInput();
      }
      return;
    }

    if (stage === "create") {
      setFirstPin(value);
      setStage("confirm");
      resetInput();
      return;
    }

    if (stage === "confirm") {
      if (value === firstPin) {
        await savePin(value);
        onSuccess();
      } else {
        setError("PIN nggak sama, ulangi dari awal.");
        setFirstPin("");
        setStage("create");
        resetInput();
      }
    }
  };

  const handleDigit = (d) => {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + d;
    setPin(next);
    if (next.length === PIN_LENGTH) {
      handleComplete(next);
    }
  };

  const handleBackspace = () => {
    setPin((p) => p.slice(0, -1));
  };

  const handleRemovePin = async () => {
    await removePin();
    onSuccess();
  };

  if (stage === "manage") {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.content}>
          <Text style={styles.title}>Kelola PIN</Text>
          <Pressable
            style={styles.manageButton}
            onPress={() => {
              setFirstPin("");
              setStage("create");
              setError("");
            }}
          >
            <Text style={styles.manageButtonText}>Ganti PIN</Text>
          </Pressable>
          <Pressable style={[styles.manageButton, styles.manageButtonDanger]} onPress={handleRemovePin}>
            <Text style={[styles.manageButtonText, styles.manageButtonDangerText]}>
              Matikan Kunci PIN
            </Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Batal</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.lockEmoji}>🔒</Text>
        <Text style={styles.title}>{title}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.dotsRow}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
          ))}
        </View>

        <View style={styles.keypad}>
          {KEYPAD_ROWS.map((row, ri) => (
            <View key={ri} style={styles.keypadRow}>
              {row.map((key, ki) => {
                if (key === "") return <View key={ki} style={styles.keypadKey} />;
                if (key === "back") {
                  return (
                    <Pressable key={ki} style={styles.keypadKey} onPress={handleBackspace}>
                      <Text style={styles.keypadKeyText}>⌫</Text>
                    </Pressable>
                  );
                }
                return (
                  <Pressable
                    key={ki}
                    style={styles.keypadKey}
                    onPress={() => handleDigit(key)}
                    disabled={isChecking}
                  >
                    <Text style={styles.keypadKeyText}>{key}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        {onCancel ? (
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Batal</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0a051b" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  lockEmoji: { fontSize: 40 },
  title: { color: "#ffffff", fontSize: 18, fontWeight: "900", marginTop: 4 },
  error: { color: "#f87171", fontSize: 13, fontWeight: "700" },
  dotsRow: { flexDirection: "row", gap: 14, marginTop: 12, marginBottom: 28 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#94a3b8",
  },
  dotFilled: { backgroundColor: "#ec4899", borderColor: "#ec4899" },
  keypad: { gap: 16 },
  keypadRow: { flexDirection: "row", gap: 24 },
  keypadKey: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  keypadKeyText: { color: "#ffffff", fontSize: 26, fontWeight: "700" },
  cancelButton: { marginTop: 24, paddingVertical: 10 },
  cancelButtonText: { color: "#94a3b8", fontSize: 14, fontWeight: "700" },
  manageButton: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
    width: 260,
    alignItems: "center",
  },
  manageButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  manageButtonDanger: { backgroundColor: "rgba(248,113,113,0.15)" },
  manageButtonDangerText: { color: "#f87171" },
});
