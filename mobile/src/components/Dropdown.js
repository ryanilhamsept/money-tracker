import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native";
import { colors } from "../theme";

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
    backgroundColor: colors.surfaceMuted,
    borderColor: "#0f5479",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  triggerText: {
    color: "#e8f3fb",
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  chevron: {
    color: "#7aa0b8",
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
    backgroundColor: "#083c5a",
    borderRadius: 24,
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
    borderRadius: 16,
  },
  optionSelected: {
    backgroundColor: "rgba(244,114,182,0.14)",
  },
  optionText: {
    color: "#cfe3f0",
    fontSize: 15,
    fontWeight: "700",
  },
  optionTextSelected: {
    color: "#f472b6",
  },
  check: {
    color: "#f472b6",
    fontSize: 15,
    fontWeight: "900",
  },
  closeButton: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  closeButtonText: {
    color: "#9cbed4",
    fontSize: 13,
    fontWeight: "700",
  },
});
