import { describe, expect, it } from "vitest";

import {
  AUTOMATION_OPEN_PARAM,
  afterSubmitChain,
  automationOpenHref,
  listensToForm,
  newAutomationHref,
} from "../public-form-after-submit";

import { FORM_ID, TYPE_ID, rule } from "./public-form-fixtures";

const FORM = { id: FORM_ID, typeId: TYPE_ID };
const OTHER_TYPE = "40000000-0000-4000-8000-0000000000aa";
const OTHER_FORM = "50000000-0000-4000-8000-0000000000aa";

describe("links into the automations page", () => {
  it("opens one automation with the parameter the automations page reads", () => {
    expect(AUTOMATION_OPEN_PARAM).toBe("open");
    expect(automationOpenHref("80000000-0000-4000-8000-000000000001")).toBe(
      "/automations?open=80000000-0000-4000-8000-000000000001",
    );
  });

  it("starts a new form automation for this form and its list", () => {
    expect(newAutomationHref(FORM)).toBe(`/automations?new=formSubmitted&typeId=${TYPE_ID}&sourceId=${FORM_ID}`);
  });

  it("starts a new automation for the list alone while the form is not saved yet", () => {
    expect(newAutomationHref({ id: null, typeId: TYPE_ID })).toBe(`/automations?new=formSubmitted&typeId=${TYPE_ID}`);
  });
});

describe("which automations listen to a form", () => {
  it("accepts a rule that names this form", () => {
    expect(listensToForm({ trigger: { kind: "formSubmitted", sourceId: FORM_ID } }, FORM)).toBe(true);
    expect(listensToForm({ trigger: { kind: "formSubmitted", sourceId: OTHER_FORM } }, FORM)).toBe(false);
  });

  it("accepts a rule for the list of the form when it names no form", () => {
    expect(listensToForm({ trigger: { kind: "formSubmitted", typeId: TYPE_ID } }, FORM)).toBe(true);
    expect(listensToForm({ trigger: { kind: "formSubmitted", typeId: OTHER_TYPE } }, FORM)).toBe(false);
  });

  it("lets a rule that names a form win over its list", () => {
    expect(listensToForm({ trigger: { kind: "formSubmitted", typeId: TYPE_ID, sourceId: OTHER_FORM } }, FORM)).toBe(
      false,
    );
  });

  it("accepts a rule that names neither, which fires for every form", () => {
    expect(listensToForm({ trigger: { kind: "formSubmitted" } }, FORM)).toBe(true);
  });

  it("ignores every other trigger and a form that is not saved yet", () => {
    expect(listensToForm({ trigger: { kind: "recordCreated", typeId: TYPE_ID } }, FORM)).toBe(false);
    expect(listensToForm({ trigger: { kind: "webhookReceived", typeId: TYPE_ID } }, FORM)).toBe(false);
    expect(
      listensToForm({ trigger: { kind: "formSubmitted", sourceId: FORM_ID } }, { id: null, typeId: TYPE_ID }),
    ).toBe(false);
  });
});

describe("afterSubmitChain", () => {
  it("reads the record, the person and the notified members of the enabled rules", () => {
    const chain = afterSubmitChain(
      [
        rule(),
        rule({
          id: "80000000-0000-4000-8000-000000000002",
          name: "Assign",
          effects: [
            {
              kind: "notify",
              recipients: {
                ruleOwner: false,
                assignees: true,
                userIds: ["90000000-0000-4000-8000-000000000009", "90000000-0000-4000-8000-00000000000a"],
              },
              notificationKind: "ruleAlert",
              title: "Assigned",
            },
          ],
        }),
      ],
      FORM,
      "People",
    );

    expect(chain.createsRecord).toBe(true);
    expect(chain.personListLabel).toBe("People");
    expect(chain.recipients).toEqual({ owners: ["Test User"], assignees: true, members: 2 });
    expect(chain.rules.map((entry) => entry.name)).toEqual(["Tell me about new leads", "Assign"]);
  });

  it("lists a paused rule but does not count it as a notification", () => {
    const chain = afterSubmitChain([rule({ enabled: false })], FORM, null);

    expect(chain.rules).toEqual([expect.objectContaining({ enabled: false })]);
    expect(chain.recipients).toBeNull();
  });

  it("has no notification step when no listening rule notifies", () => {
    const chain = afterSubmitChain(
      [
        rule({
          effects: [
            { kind: "createRecord", typeId: TYPE_ID, fields: [], assignToRuleOwner: false, assignedUserIds: [] },
          ],
        }),
      ],
      FORM,
      null,
    );

    expect(chain.recipients).toBeNull();
    expect(chain.rules).toHaveLength(1);
  });

  it("drops rules of other forms and has an empty chain for a form nobody listens to", () => {
    const chain = afterSubmitChain(
      [
        rule({ trigger: { kind: "formSubmitted", typeId: OTHER_TYPE } }),
        rule({ trigger: { kind: "recordCreated", typeId: TYPE_ID } }),
      ],
      FORM,
      null,
    );

    expect(chain).toEqual({ createsRecord: true, personListLabel: null, recipients: null, rules: [] });
  });

  it("names no owner for a rule whose owner is gone", () => {
    const chain = afterSubmitChain([rule({ owner: null, ownerUserId: null })], FORM, null);

    expect(chain.recipients).toEqual({ owners: [], assignees: false, members: 0 });
  });
});
