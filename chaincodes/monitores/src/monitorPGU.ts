import {
  Context,
  Contract,
  Info,
  Returns,
  Transaction,
} from "fabric-contract-api";
import * as stringify from "json-stringify-deterministic";
import * as sortKeysRecursive from "sort-keys-recursive";
import { Constraint } from "./constraint";
import { Infractions } from "./infractions";
import { Measure } from "./measure";
import { PGU } from "./pgu";
import { PguStateUpdateDto } from "./pgu-state-update.dto";

@Info({
  title: "MonitorPGU",
  description: "Smart contract for monitoring PGUs",
})
export class MonitorPGUContract extends Contract {
  constructor() {
    super("MonitorPGUContract");
  }

  @Transaction()
  public async CreatePGU(
    ctx: Context,
    id: string,
    owner: string,
    sourceTypeId: number,
    installedPower: number,
    contractPower: number,
    creationTime: string,
    amplificationFactor:number
  ): Promise<void> {
    const exists = await this.PGUExists(ctx, id);
    if (exists) {
      throw new Error(`The PGU ${id} already exists`);
    }
    const initialConstraint = {
      applicationTime: null,
      powerLimit: -1,
    } as Constraint;
    const initialMeasure = {
      timeStamp: creationTime,
      measuredPower: null,
      id: id,
    } as Measure;
    const initialInfractionList = {
      minor: { timeStamp: null, count: 0 },
      major: { timeStamp: null, count: 0 },
      critical: { timeStamp: null, count: 0 },
    } as Infractions;
    const pgu = {
      id: id,
      statusId: 0,
      sourceTypeId: sourceTypeId,
      constraint: initialConstraint,
      owner: owner,
      installedPower: installedPower,
      contractPower: contractPower,
      infractions: initialInfractionList,
      measure: initialMeasure,
      nbOnboardingMeasures: 0,
      amplificationFactor: amplificationFactor,
    } as PGU;
    await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
  }

  @Transaction()
  public async ReleasePGU(ctx: Context, id: string): Promise<void> {
    const pguString = await this.GetPGU(ctx, id);
    const pgu: PGU = JSON.parse(pguString);
    pgu.statusId = 1;
    await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
  }

  @Transaction(false)
  public async GetPGU(ctx: Context, id: string): Promise<string> {
    const pguJSON = await ctx.stub.getState(id);
    if (!pguJSON || pguJSON.length === 0) {
      throw new Error(`The PGU ${id} does not exists`);
    }
    return pguJSON.toString();
  }

  // GetAllPGUs returns all PGUs found in the world state.
  @Transaction(false)
  @Returns("string")
  public async GetAllPGUs(ctx: Context): Promise<string> {
    const allResults = [];
    // range query with empty string for startKey and endKey does an open-ended query of all assets in the chaincode namespace.
    const iterator = await ctx.stub.getStateByRange("", "");
    let result = await iterator.next();
    while (!result.done) {
      const strValue = Buffer.from(result.value.value.toString()).toString(
        "utf8"
      );
      let record;
      try {
        record = JSON.parse(strValue);
      } catch (err) {
        console.log(err);
        record = strValue;
      }
      allResults.push(record);
      result = await iterator.next();
    }
    return JSON.stringify(allResults);
  }

  @Transaction()
  public async DeletePGU(ctx: Context, id: string): Promise<void> {
    const exists = await this.PGUExists(ctx, id);
    if (!exists) {
      throw new Error(`The PGU ${id} does not exists`);
    }
    await ctx.stub.deleteState(id);
  }

  @Transaction(false)
  @Returns("boolean")
  public async PGUExists(ctx: Context, id: string): Promise<boolean> {
    const pguJSON = await ctx.stub.getState(id);
    return pguJSON && pguJSON.length > 0;
  }

  @Transaction()
  public async DeclareAlert(ctx: Context, id: string): Promise<void> {
    const pguString = await this.GetPGU(ctx, id);
    const pgu: PGU = JSON.parse(pguString);
    pgu.statusId = 2;
    await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
  }

  @Transaction()
  public async DeclareUrgency(ctx: Context, id: string): Promise<void> {
    const pguString = await this.GetPGU(ctx, id);
    const pgu: PGU = JSON.parse(pguString);
    pgu.statusId = 3;
    await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
  }

  @Transaction()
  public async StopPGU(ctx: Context, id: string): Promise<void> {
    const pguString = await this.GetPGU(ctx, id);
    const pgu: PGU = JSON.parse(pguString);
    pgu.statusId = 4;
    await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
  }

  @Transaction()
  public async SubmitMeasure(
    ctx: Context,
    id: string,
    power: number,
    time: string
  ): Promise<void> {
    const pguString = await this.GetPGU(ctx, id);
    const pgu: PGU = JSON.parse(pguString);

    switch (pgu.statusId) {
      case 4: {
        throw new Error(`PGU ${id} not autorised to produce`);
        break;
      }
      case 0:
      case 1: {
        const constraintTimeDate = new Date(pgu.constraint.applicationTime);
        const measureTimeDate = new Date(time);
        const timeDelay =
          measureTimeDate.getTime() - constraintTimeDate.getTime();
        if (
          pgu.constraint.powerLimit > 0 &&
          power >= pgu.constraint.powerLimit &&
          timeDelay >= 0 &&
          timeDelay <= 5 * 1000 * 60
        ) {
          await this.updateInfractions(pgu, "major", time);
        }
        pgu.measure = { timeStamp: time, measuredPower: power } as Measure;
        await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
        break;
      }
      case 2: {
        if (power >= pgu.contractPower) {
          await this.updateInfractions(pgu, "critical", time);
        }
        pgu.measure = { timeStamp: time, measuredPower: power } as Measure;
        await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
        break;
      }
      case 3: {
        if (power >= 0) {
          await this.updateInfractions(pgu, "critical", time);
        }
        pgu.measure = { timeStamp: time, measuredPower: power } as Measure;
        await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
        break;
      }
      default:
        break;
    }
  }

  @Transaction()
  public async GetMeasure(
    ctx: Context,
    id: string,
    expectedTime: string
  ): Promise<string> {
    const pguString = await this.GetPGU(ctx, id);
    const pgu: PGU = JSON.parse(pguString);

    let pguUpdate: PguStateUpdateDto;
    let onBoardPercentage: number;
    let needUpdate: boolean;

    const expectedTimeDate = new Date(expectedTime);
    const measureTimeDate = new Date(pgu.measure.timeStamp);
    const timeDelay = expectedTimeDate.getTime() - measureTimeDate.getTime();
    const delayLimit = 2 * 60 * 1000;
    needUpdate = this.forgiveInfraction(pgu, expectedTime);
    if (timeDelay > delayLimit) {
      await this.updateInfractions(pgu, "minor", expectedTime);
      await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
      const missedMeasure: Measure = {
        timeStamp: expectedTime,
        measuredPower: null,
        id: id,
      };
      pguUpdate = new PguStateUpdateDto(
        id,
        pgu.statusId,
        missedMeasure,
        pgu.infractions,
        pgu.constraint
      );
    } else {
      if (pgu.statusId === 0 && pgu.measure.measuredPower !== null) {
        if (pgu.nbOnboardingMeasures < 20) {
          pgu.nbOnboardingMeasures++;
          onBoardPercentage = pgu.nbOnboardingMeasures / 20;
        } else {
          pgu.statusId = 1;
          pgu.nbOnboardingMeasures = null;
          onBoardPercentage = null;
        }
        needUpdate = true;
      }
      if (needUpdate) {
        await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
      }
      pguUpdate = new PguStateUpdateDto(
        pgu.id,
        pgu.statusId,
        pgu.measure,
        pgu.infractions,
        pgu.constraint,
        onBoardPercentage
      );
    }
    return JSON.stringify(pguUpdate);
  }

  @Transaction()
  public async SubmitConstraint(
    ctx: Context,
    id: string,
    powerLimit: number,
    applicationTime: string
  ): Promise<void> {
    const pguString = await this.GetPGU(ctx, id);
    const pgu: PGU = JSON.parse(pguString);
    pgu.constraint = {
      applicationTime: applicationTime,
      powerLimit: powerLimit,
    };
    await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
  }

  @Transaction(false)
  public async GetConstraint(ctx: Context, id: string): Promise<string> {
    const pguString = await this.GetPGU(ctx, id);
    const pgu: PGU = JSON.parse(pguString);
    return JSON.stringify({constraint: pgu.constraint, statusId: pgu.statusId, contractPower: pgu.contractPower});
  }

  public async updateInfractions(
    pgu: PGU,
    newInfractionType: "minor" | "major" | "critical",
    infractionTime: string
  ) {
    if (pgu.statusId === 0) {
      pgu.nbOnboardingMeasures = 0;
    }
    switch (newInfractionType) {
      case "minor": {
        pgu.infractions.minor.count++;
        pgu.infractions.minor.timeStamp = infractionTime;
        if (pgu.infractions.minor.count > 3) {
          pgu.infractions.minor.count = 0;
          await this.updateInfractions(pgu, "major", infractionTime);
        }
        break;
      }
      case "major": {
        pgu.infractions.major.count++;
        pgu.infractions.major.timeStamp = infractionTime;
        if (pgu.statusId === 1) {
          pgu.statusId = 2;
        }
        if (pgu.infractions.major.count > 3) {
          pgu.infractions.major.count = 0;
          await this.updateInfractions(pgu, "critical", infractionTime);
        }
        break;
      }
      case "critical": {
        pgu.infractions.critical.count++;
        pgu.infractions.critical.timeStamp = infractionTime;
        if (pgu.statusId === 1 || pgu.statusId === 2) {
          pgu.statusId = 3;
        }
        if (pgu.infractions.critical.count > 3) {
          pgu.statusId = 4;
        }
        break;
      }
      default:
        break;
    }
  }

  forgiveInfraction(pgu: PGU, currentTime: string): boolean {
    const currentTimeDate = new Date(currentTime);
    const forgiveDelayMinor = 2 * 60 * 1000;
    const forgiveDelayMajor = 5 * 60 * 1000;

    if (pgu.infractions.minor.count > 0) {
      const lastMinorTime = new Date(pgu.infractions.minor.timeStamp)
      if(currentTimeDate.getTime() - lastMinorTime.getTime() > forgiveDelayMinor ) {
        pgu.infractions.minor.count--;
        return true;
      }
    }
    if (pgu.infractions.major.count > 0) {
      const lastMajorTime = new Date(pgu.infractions.major.timeStamp)
      if(currentTimeDate.getTime() - lastMajorTime.getTime() > forgiveDelayMajor ) {
        pgu.infractions.major.count--;
        return true;
      }
    }  
    return false; 
  }
}
