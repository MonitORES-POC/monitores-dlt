import {Object, Property} from 'fabric-contract-api';
import { Constraint } from './constraint';
import { Infractions } from './infractions';
import { Measure } from './measure';

@Object()
export class PGU {
    @Property()
    public id: string;

    @Property()
    public statusId: number;

    @Property()
    public measure?: Measure;

    @Property()
    public owner: string;

    @Property()
    public constraint: Constraint;

    @Property()
    public sourceTypeId: number;

    @Property()
    public installedPower: number;

    @Property()
    public contractPower: number;

    @Property()
    public infractions?: Infractions;

    @Property()
    public nbOnboardingMeasures?: number;

    //@Property()
    //public EnergyBalance?: number;
}
