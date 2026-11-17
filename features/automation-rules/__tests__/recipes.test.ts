import { describe, expect, it } from "vitest";

import {
  AUTOMATION_RECIPES,
  AUTOMATION_RECIPE_IDS,
  availableRecipes,
  recipeById,
  type AutomationRecipe,
} from "../recipes";

describe("automation recipes", () => {
  it("defines each of the seven recipes exactly once", () => {
    expect(AUTOMATION_RECIPES.map((recipe) => recipe.id)).toEqual([...AUTOMATION_RECIPE_IDS]);
    expect(new Set(AUTOMATION_RECIPES.map((recipe) => recipe.id)).size).toBe(7);
  });

  it("keeps the weekly review a routine on Cloud and every other recipe an exact or agent rule", () => {
    const routines = AUTOMATION_RECIPES.filter((recipe) => recipe.kind === "routine");
    expect(routines.map((recipe) => recipe.id)).toEqual(["weeklyReview"]);
    expect(routines[0]).toMatchObject({ cloudOnly: true, usesAgent: true });
    expect(AUTOMATION_RECIPES.filter((recipe) => recipe.cloudOnly).map((recipe) => recipe.id)).toEqual([
      "weeklyReview",
    ]);
  });

  it("marks a recipe as using an agent only when it has an agent step", () => {
    for (const recipe of AUTOMATION_RECIPES)
      expect(recipe.usesAgent, recipe.id).toBe(recipe.effects.some((effect) => effect.kind === "agent"));
  });

  it("gives every effect a text slot and every rule at least one step", () => {
    for (const recipe of AUTOMATION_RECIPES) {
      expect(recipe.effects.length, recipe.id).toBeGreaterThan(0);
      recipe.effects.forEach((effect, index) => expect(effect.text, `${recipe.id} ${index}`).toBe(index));
    }
  });

  it("asks the user for the lists and fields a recipe cannot know", () => {
    const slots = (id: string) => recipeById(id)?.slots;
    expect(slots("followUpAfterOffer")).toEqual(["list", "stageField"]);
    expect(slots("remindBeforeRenewal")).toEqual(["list", "dateField"]);
    expect(slots("wonOrLostReason")).toEqual(["list", "stageField", "reasonField"]);
    expect(slots("welcomeSubmission")).toEqual([]);
  });

  it("offers the routine recipe only on Cloud", () => {
    const ids = (recipes: AutomationRecipe[]) => recipes.map((recipe) => recipe.id);
    expect(ids(availableRecipes({ cloud: true }))).toContain("weeklyReview");
    expect(ids(availableRecipes({ cloud: false }))).not.toContain("weeklyReview");
    expect(availableRecipes({ cloud: false })).toHaveLength(6);
  });

  it("finds a recipe by id and returns nothing for an unknown id", () => {
    expect(recipeById("answerEnquiries")?.trigger).toEqual({ kind: "formSubmitted" });
    expect(recipeById("nope")).toBeUndefined();
  });
});
