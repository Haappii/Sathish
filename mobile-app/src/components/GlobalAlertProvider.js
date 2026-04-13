import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const DEFAULT_TITLE = "Notice";

function normalizeButtons(buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) {
    return [{ text: "OK", style: "default" }];
  }
  return buttons.map((btn) => ({
    text: String(btn?.text || "OK"),
    onPress: typeof btn?.onPress === "function" ? btn.onPress : null,
    style: btn?.style || "default",
  }));
}

export default function GlobalAlertProvider({ children }) {
  const [queue, setQueue] = useState([]);
  const [activeAlert, setActiveAlert] = useState(null);
  const originalAlertRef = useRef(Alert.alert);

  const dequeue = () => {
    setQueue((prev) => {
      if (!prev.length) return prev;
      const [next, ...rest] = prev;
      setActiveAlert(next);
      return rest;
    });
  };

  const closeAlert = () => {
    const onDismiss = activeAlert?.options?.onDismiss;
    setActiveAlert(null);
    if (typeof onDismiss === "function") {
      try {
        onDismiss();
      } catch {
        // Keep dismiss resilient to callback errors.
      }
    }
  };

  const handleButtonPress = (button) => {
    closeAlert();
    if (typeof button?.onPress === "function") {
      try {
        button.onPress();
      } catch {
        // Keep alert UI stable even if caller callback throws.
      }
    }
  };

  useEffect(() => {
    if (!activeAlert && queue.length > 0) {
      dequeue();
    }
  }, [activeAlert, queue]);

  useEffect(() => {
    const originalAlert = originalAlertRef.current;
    Alert.alert = (title, message, buttons, options) => {
      setQueue((prev) => [
        ...prev,
        {
          title: String(title || DEFAULT_TITLE),
          message: String(message || ""),
          buttons: normalizeButtons(buttons),
          options: options || {},
        },
      ]);
    };

    return () => {
      Alert.alert = originalAlert;
    };
  }, []);

  const buttonRows = useMemo(() => {
    const rows = activeAlert?.buttons || [];
    if (rows.length <= 2) return [rows];
    return [rows.slice(0, 2), rows.slice(2)];
  }, [activeAlert]);

  const cancelable = Boolean(activeAlert?.options?.cancelable);

  return (
    <>
      {children}
      <Modal
        transparent
        visible={Boolean(activeAlert)}
        animationType="fade"
        onRequestClose={() => {
          if (cancelable) closeAlert();
        }}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (cancelable) closeAlert();
          }}
        >
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>{activeAlert?.title || DEFAULT_TITLE}</Text>
            {!!activeAlert?.message && (
              <Text style={styles.message}>{activeAlert.message}</Text>
            )}

            <View style={styles.actionsWrap}>
              {buttonRows.map((row, idx) => (
                <View key={`row-${idx}`} style={styles.actionsRow}>
                  {row.map((button, bIdx) => {
                    const isDestructive = button.style === "destructive";
                    const isCancel = button.style === "cancel";
                    return (
                      <Pressable
                        key={`btn-${idx}-${bIdx}`}
                        style={[
                          styles.button,
                          isDestructive && styles.buttonDanger,
                          isCancel && styles.buttonCancel,
                        ]}
                        onPress={() => handleButtonPress(button)}
                      >
                        <Text
                          style={[
                            styles.buttonText,
                            isDestructive && styles.buttonTextDanger,
                            isCancel && styles.buttonTextCancel,
                          ]}
                        >
                          {button.text}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.46)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    gap: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: "#334155",
  },
  actionsWrap: {
    gap: 8,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1d4ed8",
    backgroundColor: "#1d4ed8",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  buttonDanger: {
    backgroundColor: "#dc2626",
    borderColor: "#dc2626",
  },
  buttonCancel: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  buttonTextDanger: {
    color: "#ffffff",
  },
  buttonTextCancel: {
    color: "#334155",
  },
});
