import type { CorrectionLog as CorrectionLogType } from "../types/subtitle";

interface Props {
  readonly log: CorrectionLogType;
}

export function CorrectionLog({ log }: Props) {
  return (
    <div className="correction-entry">
      <div className="correction-change">
        <span className="correction-old">{log.oldEnglish}</span>
        <span className="correction-arrow"> → </span>
        <span className="correction-new">{log.newEnglish}</span>
      </div>
      <p className="correction-reason">{log.reason}</p>
    </div>
  );
}
