import { describe, expect, it } from "vitest";
import { enlargement } from "./aspect";

describe("enlargement", () => {
  it("measures how much a 720p source is enlarged for each shape", () => {
    const crop = (aspect: string, width: number, height: number) =>
      enlargement(1280, 720, { aspect, width, height, framing: "crop" });
    expect(crop("9:16", 1080, 1920).factor).toBeCloseTo(2.67, 2);
    expect(crop("9:16", 1080, 1920).native).toEqual([404, 718]);
    expect(crop("1:1", 1080, 1080).factor).toBeCloseTo(1.5, 2);
    expect(crop("1:1", 1080, 1080).native).toEqual([720, 720]);
    expect(crop("4:5", 1080, 1350).native).toEqual([576, 720]);
  });

  it("is 1 or less when the source is large enough", () => {
    expect(enlargement(3840, 2160, { aspect: "9:16", width: 1080, height: 1920, framing: "crop" }).factor).toBeLessThan(1);
    expect(enlargement(1920, 1080, { aspect: "16:9", width: 1920, height: 1080, framing: "fit" }).factor).toBe(1);
  });
});
