import {Context, Contract, Info, Returns, Transaction} from 'fabric-contract-api';
import * as stringify from 'json-stringify-deterministic';
import * as sortKeysRecursive from 'sort-keys-recursive';
import {PGU} from './pgu';

@Info({title: 'MonitorPGU', description: 'Smart contract for monitoring PGUs'})
export class MonitorPGUContract extends Contract {

    constructor() {
        super("MonitorPGUContract");
    }
    
    @Transaction()
    public async CreatePGU(ctx: Context, id: string, owner: string, sourceTypeid: number, installedPower: number, contractPower: number): Promise<void> {
        const exists = await this.PGUExists(ctx, id);
        if (exists) {
            throw new Error(`The PGU ${id} already exists`);
        }
        //pgu1 = new PGU(St)
        const pgu = {
            ID: id,
            StatusId: 1,
            SourceTypeid: sourceTypeid,
            Owner: owner,
            InstalledPower: installedPower,
            ContractPower: contractPower
        };
        await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
    }
    
    @Transaction()
    public async ReleasePGU(ctx: Context, id: string): Promise<void> {
        const pguString = await this.GetPGU(ctx, id);
        const pgu = JSON.parse(pguString);
        pgu.Status = 1;
        await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
    }
    
    @Transaction(false)
    public async GetPGU(ctx: Context, id: string): Promise<string> {
        const pguJSON = await ctx.stub.getState(id);
        if(!pguJSON || pguJSON.length === 0) {
            throw new Error(`The PGU ${id} does not exists`);
        }
        return pguJSON.toString();
    }

    // GetAllPGUs returns all PGUs found in the world state.
    @Transaction(false)
    @Returns('string')
    public async GetAllPGUs(ctx: Context): Promise<string> {
        const allResults = [];
        // range query with empty string for startKey and endKey does an open-ended query of all assets in the chaincode namespace.
        const iterator = await ctx.stub.getStateByRange('', '');
        let result = await iterator.next();
        while (!result.done) {
            const strValue = Buffer.from(result.value.value.toString()).toString('utf8');
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
    @Returns('boolean')
    public async PGUExists(ctx: Context, id: string): Promise<boolean> {
        const pguJSON = await ctx.stub.getState(id);
        return pguJSON && pguJSON.length > 0;
    }

    @Transaction()
    public async DeclareAlert(ctx: Context, id: string): Promise<void> {
        const pguString = await this.GetPGU(ctx, id);
        const pgu = JSON.parse(pguString);
        pgu.Status = 2;
        await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
    }

    @Transaction()
    public async DeclareUrgency(ctx: Context, id: string): Promise<void> {
        const pguString = await this.GetPGU(ctx, id);
        const pgu = JSON.parse(pguString);
        pgu.Status = 3;
        await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
    }

    @Transaction()
    public async Measure(ctx: Context, id: string, power: number, time: string): Promise<void> { 
        const pguString = await this.GetPGU(ctx, id);
        const pgu = JSON.parse(pguString);
        if (pgu.Status === 0) {
            pgu.Infractions.minor++;
            await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
            throw new Error(`PGU ${id} not autorised to produce`);
        }
        if (power > pgu.Capacities.alert) {
            pgu.Infractions.serious++;
            await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
            throw new Error(`Measure of PGU ${id} greater than alert capacity`);
        }
        if (time < pgu.Production.measureTime) {
            //pgu.Infractions.minor++;
            //await ctx.stub.putState(id, Buffer.from(JSON.stringify(pgu)));
            throw new Error(`Measure time of PGU ${id}is from the past`);
        }

        // Power rules
        // Time rules

        pgu.Production = {measureTime: time, measure: power};
        await ctx.stub.putState(id, Buffer.from(stringify(pgu)));
    }


}