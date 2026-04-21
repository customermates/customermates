import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { SendContactInquiryData } from "@/features/contact/send-contact-inquiry.schema";

import { action, makeObservable, observable, toJS } from "mobx";
import { toast } from "sonner";

import { sendContactInquiryAction } from "./actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class ContactStore extends BaseFormStore<SendContactInquiryData> {
  isSent = false;

  constructor(public readonly rootStore: RootStore) {
    super(rootStore, { name: "", email: "", company: "", message: "" });

    makeObservable(this, {
      isSent: observable,
      onSubmit: action,
      reset: action,
    });
  }

  reset = () => {
    this.isSent = false;
    this.onInitOrRefresh({ name: "", email: "", company: "", message: "" });
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    try {
      const payload = toJS(this.form);
      const res = await sendContactInquiryAction({
        ...payload,
        company: payload.company?.trim() ? payload.company : undefined,
      });

      if (res.ok) {
        this.isSent = true;
        this.onInitOrRefresh({ name: "", email: "", company: "", message: "" });
        toast.success(this.rootStore.localeStore.getTranslation("ContactPage.form.successToast"));
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
