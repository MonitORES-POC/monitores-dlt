import {Object, Property} from 'fabric-contract-api';

@Object()
export class PGU {
    @Property()
    public ID: string;

    @Property()
    public StatusId: number;

    //@Property()
    //public Production?: number;

    @Property()
    public Owner: string;

    //@Property()
    //public Constraint: number;

    @Property()
    public SourceTypeId: number;

    @Property()
    public installedPower: number;

    @Property()
    public contractPower: number;

    //@Property()
    //public Infractions?: number;

    //@Property()
    //public EnergyBalance?: number;
}
