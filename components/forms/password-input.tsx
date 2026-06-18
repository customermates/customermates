"use client";

import type { ComponentProps } from "react";

import { observer } from "mobx-react-lite";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { FormInput } from "./form-input";

type Props = Omit<ComponentProps<typeof FormInput>, "type" | "endContent"> & {
  showPassword: boolean;
  onToggleVisibility: () => void;
};

export const PasswordInput = observer(({ showPassword, onToggleVisibility, ...props }: Props) => (
  <FormInput
    {...props}
    endContent={
      <Button
        aria-label={showPassword ? "Hide password" : "Show password"}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={onToggleVisibility}
      >
        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
      </Button>
    }
    type={showPassword ? "text" : "password"}
  />
));
