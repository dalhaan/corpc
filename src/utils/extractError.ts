export const extractError = (error: unknown) => {
  if (error === null || error === undefined) {
    return;
  }

  if (typeof error === "string") {
    return error;
  }

  if (
    error instanceof Error ||
    (typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string")
  ) {
    return error.message as string;
  }

  return;
};
