import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { SendContactInquiryData } from "@/features/contact/send-contact-inquiry.schema";

import { action, makeObservable, observable, toJS } from "mobx";

import { sendContactInquiryAction } from "./actions";

import { BaseFormStore } from "@/core/base/base-form.store";

export class ContactStore extends BaseFormStore<SendContactInquiryData> {
  isSent = false;

  constructor(rootStore: RootStore) {
    super(rootStore, {
      name: "",
      email: "",
      company: "",
      message: "",
      privacyAcknowledged: false,
    });

    makeObservable(this, {
      isSent: observable,
      onSubmit: action,
      reset: action,
    });
  }

  reset = () => {
    this.isSent = false;
    this.onInitOrRefresh({
      name: "",
      email: "",
      company: "",
      message: "",
      privacyAcknowledged: false,
    });
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
        this.onInitOrRefresh({
          name: "",
          email: "",
          company: "",
          message: "",
          privacyAcknowledged: false,
        });
        this.toastSuccess("ContactPage.form.successToast");
      } else this.setError(res.error);
    } finally {
      this.setIsLoading(false);
    }
  };
}
