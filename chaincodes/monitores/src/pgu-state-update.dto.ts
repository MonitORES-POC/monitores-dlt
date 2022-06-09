import { Constraint } from './constraint';
import { Infractions } from './infractions';
import { Measure } from './measure';

export class PguStateUpdateDto {
  constructor(
    public readonly id: string,
    public readonly statusId: number,
    public readonly measure: Measure,
    public readonly infractionList: Infractions,
    public readonly constraint: Constraint,
    public readonly onBoardPercentage?: number,
  ) {}

  toString() {
    return JSON.stringify({
      id: this.id,
      measure: this.measure,
      statusId: this.statusId,
      infractionList: this.infractionList,
      constraint: this.constraint,
      onBoardPercentage: this.onBoardPercentage
    });
  }
}
