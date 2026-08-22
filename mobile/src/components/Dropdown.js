import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native";

export default function Dropdown({ value, options, onChange, placeholder = "Pilih" }) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={styles.optionList} showsVerticalScrollIndicator={false}>
              {options.map((option) => {
                const selected = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.option,
                      selected && styles.optionSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {option.label}
                    </Text>
                    {selected ? <Text style={styles.check}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            <Pressable style={styles.closeButton} onPress={() => setOpen(false)}>
              <Text style={styles.closeButtonText}>Tutup</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f4f7fb",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  triggerText: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  chevron: {
    color: "#94a3b8",
    fontSize: 16,
    fontWeight: "900",
    marginLeft: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 10,
    maxHeight: "70%",
  },
  optionList: {
    maxHeight: 360,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
  },
  optionSelected: {
    backgroundColor: "#fdf2f8",
  },
  optionText: {
    color: "#334155",
    fontSize: 15,
    fontWeight: "700",
  },
  optionTextSelected: {
    color: "#ec4899",
  },
  check: {
    color: "#ec4899",
    fontSize: 15,
    fontWeight: "900",
  },
  closeButton: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  closeButtonText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },
});
