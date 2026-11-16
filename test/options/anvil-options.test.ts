import { AnvilOptions } from "../../src";

describe("AnvilOptions", () => {
  it("should have default entrypoint", () => {
    const options = new AnvilOptions();
    expect(options.entryPoint).toEqual(["anvil", "--host", "0.0.0.0"]);
  });

  it("should allow extra args", () => {
    const options = new AnvilOptions();
    options.withExtraArgs("--custom-flag");
    expect(options.entryPoint).toContain("--custom-flag");
  });

  it("should return sub-options modules", () => {
    const options = new AnvilOptions();
    expect(options.network).toBeDefined();
    expect(options.server).toBeDefined();
    expect(options.state).toBeDefined();
    expect(options.mining).toBeDefined();
    expect(options.logs).toBeDefined();
    expect(options.fork).toBeDefined();
    expect(options.evm).toBeDefined();
    expect(options.account).toBeDefined();
  });
});
