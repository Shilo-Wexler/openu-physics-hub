/** Picks the inquiry type the list shows. Five fixed types, so no search. */

import { useNavigate, useSearchParams } from "react-router";

import { INQUIRY_TYPES, type InquiryType } from "../../api/inquiries";
import BackLink from "../../components/BackLink";
import { Group, Row } from "../../components/GroupedList";
import { TYPE_LABEL } from "../../lib/inquiryLabels";
import { filtersSearch, readFilters } from "./filters";
import styles from "./pickers.module.css";

export default function TypePickerPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const filters = readFilters(params);

  // replace: as in the course picker, back returns to the list as it was before the choice.
  function choose(type: InquiryType | null) {
    navigate(`/inquiries${filtersSearch({ ...filters, type })}`, { replace: true });
  }

  const check = <span className={styles.check}>✓</span>;

  return (
    <>
      <BackLink to={`/inquiries${filtersSearch(filters)}`} label="פניות" />
      <h1>סוג</h1>

      <Group>
        <Row label="כל הסוגים" value={filters.type === null ? check : undefined} onClick={() => choose(null)} />
      </Group>

      <Group>
        {INQUIRY_TYPES.map((type) => (
          <Row
            key={type}
            label={TYPE_LABEL[type]}
            value={type === filters.type ? check : undefined}
            onClick={() => choose(type)}
          />
        ))}
      </Group>
    </>
  );
}