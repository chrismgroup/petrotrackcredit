import { forwardRef } from "react";
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller";
import { Platform, ScrollView, ScrollViewProps } from "react-native";

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

export const KeyboardAwareScrollViewCompat = forwardRef<ScrollView, Props>(
  function KeyboardAwareScrollViewCompat(
    {
      children,
      keyboardShouldPersistTaps = "handled",
      keyboardDismissMode = "interactive",
      bottomOffset = 24,
      ...props
    },
    ref
  ) {
    if (Platform.OS === "web") {
      return (
        <ScrollView
          ref={ref}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          keyboardDismissMode={keyboardDismissMode}
          {...props}
        >
          {children}
        </ScrollView>
      );
    }
    return (
      <KeyboardAwareScrollView
        ref={ref as never}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        bottomOffset={bottomOffset}
        {...props}
      >
        {children}
      </KeyboardAwareScrollView>
    );
  }
);
