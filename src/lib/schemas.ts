import { z } from "zod";

export const intakeJsonSchema = z
  .object({
    sourceType: z.enum(["url", "local"]),
    title: z.string().trim().max(120).optional(),
    url: z.string().trim().optional(),
    localPath: z.string().trim().optional(),
    transcriptText: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.sourceType === "url" && !value.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL wajib diisi untuk source URL.",
        path: ["url"],
      });
    }

    if (value.sourceType === "local" && !value.localPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Path lokal wajib diisi.",
        path: ["localPath"],
      });
    }
  });

export const selectClipSchema = z.object({
  subtitleStyle: z.enum(["punch", "clean", "word", "sentence"]).default("punch"),
});
