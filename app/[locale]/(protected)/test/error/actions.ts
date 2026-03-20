"use server";

export async function triggerServerErrorAction() {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  throw new Error("Test server-side error from server action");
}
