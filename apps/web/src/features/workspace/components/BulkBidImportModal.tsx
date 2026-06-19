import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, LoaderCircle, Save, Send, Upload, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Modal } from "../../../components/shared/Modal";
import { errorMessage } from "../../../errors";
import type { AuthSession } from "../../../services/auth.service";
import {
  bulkCreateBids,
  createTrackingProfileRequest,
  fetchTrackingProfileRequests,
  type TrackingJobMarket,
  type TrackingProfile,
  type TrackingProfileRequest
} from "../../../services/tracking.service";
import {
  csvValue,
  inferBidCsvMapping,
  inferProfileResumeHeader,
  matchingProfile,
  normalizeProfileName,
  parseBidCsv,
  parseCsvBidDate,
  plainTextToRichText,
  splitProfileNames,
  type CsvBidField,
  type CsvBidMapping,
  type CsvTable
} from "../csv-bid-import";

const fieldLabels: Record<CsvBidField, string> = {
  jobTitle: "Job title",
  company: "Job company",
  jobLink: "Job link",
  bidAt: "Bid date/time",
  profiles: "Bid profiles",
  jobDescription: "Job description"
};

const requiredFields: CsvBidField[] = ["jobTitle", "company", "jobLink", "profiles"];

export function BulkBidImportModal({
  session,
  slug,
  memberId,
  profiles,
  markets,
  onClose,
  onImported
}: {
  session: AuthSession;
  slug: string;
  memberId: string;
  profiles: TrackingProfile[];
  markets: TrackingJobMarket[];
  onClose: () => void;
  onImported: (count: number) => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importLock = useRef(false);
  const [table, setTable] = useState<CsvTable | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<CsvBidMapping | null>(null);
  const [jobMarketId, setJobMarketId] = useState(markets[0]?.id ?? "");
  const [yearForYearlessDates, setYearForYearlessDates] = useState(new Date().getFullYear());
  const [ignoredProfileNames, setIgnoredProfileNames] = useState<Record<string, boolean>>({});
  const [resumeColumnMap, setResumeColumnMap] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [preparingImport, setPreparingImport] = useState(false);
  const requestsQuery = useQuery({
    queryKey: ["tracking-profile-requests", slug, memberId],
    queryFn: () => fetchTrackingProfileRequests(session, slug)
  });
  const requestMutation = useMutation({
    mutationFn: (name: string) => createTrackingProfileRequest(session, slug, name),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["tracking-profile-requests", slug]
      });
    }
  });
  const importMutation = useMutation({
    mutationFn: (records: Parameters<typeof bulkCreateBids>[2]) =>
      bulkCreateBids(session, slug, records),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tracking-bids", slug] }),
        queryClient.invalidateQueries({ queryKey: ["tracking-dashboard", slug] })
      ]);
      onImported(result.imported);
    },
    onSettled: () => {
      importLock.current = false;
      setPreparingImport(false);
    }
  });
  const importBusy = preparingImport || importMutation.isPending;
  const profileNames = useMemo(
    () =>
      table && mapping?.profiles
        ? [
            ...new Set(
              table.rows.flatMap((row) => splitProfileNames(csvValue(table, row, mapping.profiles)))
            )
          ]
        : [],
    [mapping?.profiles, table]
  );
  const requestsByName = useMemo(() => {
    const requests = new Map<string, TrackingProfileRequest>();
    for (const request of requestsQuery.data?.requests ?? []) {
      const key = normalizeProfileName(request.name);
      if (!requests.has(key)) {
        requests.set(key, request);
      }
    }
    return requests;
  }, [requestsQuery.data?.requests]);
  const isProfileIncluded = useCallback(
    (name: string): boolean => !ignoredProfileNames[normalizeProfileName(name)],
    [ignoredProfileNames]
  );
  const resolveProfileId = useCallback(
    (name: string): string | undefined => {
      const normalized = normalizeProfileName(name);
      return (
        matchingProfile(name, profiles)?.id ??
        requestsByName.get(normalized)?.resolvedProfileId ??
        undefined
      );
    },
    [profiles, requestsByName]
  );
  const unresolvedNames = profileNames.filter(
    (name) => isProfileIncluded(name) && !resolveProfileId(name)
  );
  const usedProfiles = useMemo(() => {
    const values = new Map<string, { id: string; name: string; sourceNames: string[] }>();
    for (const name of profileNames) {
      if (!isProfileIncluded(name)) {
        continue;
      }
      const id = resolveProfileId(name);
      if (id) {
        const current = values.get(id);
        values.set(id, {
          id,
          name: profiles.find((profile) => profile.id === id)?.name ?? name,
          sourceNames: [...new Set([...(current?.sourceNames ?? []), name])]
        });
      }
    }
    return [...values.values()];
  }, [isProfileIncluded, profileNames, profiles, resolveProfileId]);
  const mappedResumeHeaders = usedProfiles.map((profile) => resumeHeader(profile)).filter(Boolean);
  const hasDuplicateResumeColumns =
    new Set(mappedResumeHeaders).size !== mappedResumeHeaders.length;

  function importConfigurationError(): string | null {
    if (!table || !mapping || !jobMarketId) {
      return "Choose a CSV file and job market.";
    }
    if (
      !Number.isInteger(yearForYearlessDates) ||
      yearForYearlessDates < 1900 ||
      yearForYearlessDates > 2100
    ) {
      return "Choose a bid year between 1900 and 2100.";
    }
    const missingMapping = requiredFields.find((field) => !mapping[field]);
    if (missingMapping) {
      return `Map the ${fieldLabels[missingMapping]} column.`;
    }
    if (unresolvedNames.length) {
      return `Resolve or request these CSV profiles: ${unresolvedNames.join(", ")}.`;
    }
    if (hasDuplicateResumeColumns) {
      return "Each profile must use a different resume CSV column.";
    }
    return null;
  }

  async function loadFile(file: File) {
    try {
      const parsed = await parseBidCsv(file);
      setTable(parsed);
      setFileName(file.name);
      setMapping(inferBidCsvMapping(parsed.headers));
      setIgnoredProfileNames({});
      setResumeColumnMap({});
      setFormError(null);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  function resumeHeader(profile: (typeof usedProfiles)[number]): string {
    return (
      resumeColumnMap[profile.id] ??
      inferProfileResumeHeader(table?.headers ?? [], [profile.name, ...profile.sourceNames])
    );
  }

  async function buildRecords() {
    const configurationError = importConfigurationError();
    if (configurationError) {
      throw new Error(configurationError);
    }
    if (!table || !mapping) {
      throw new Error("Choose a CSV file.");
    }
    const records: Parameters<typeof bulkCreateBids>[2] = [];
    for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
      const row = table.rows[rowIndex] ?? [];
      const jobTitle = csvValue(table, row, mapping.jobTitle);
      const company = csvValue(table, row, mapping.company);
      const jobLink = csvValue(table, row, mapping.jobLink);
      const names = splitProfileNames(csvValue(table, row, mapping.profiles));
      if (!names.length) {
        throw new Error(`CSV row ${rowIndex + 2} is missing a required value.`);
      }
      const includedNames = names.filter(isProfileIncluded);
      if (!includedNames.length) {
        continue;
      }
      if (!jobTitle || !company || !jobLink) {
        throw new Error(`CSV row ${rowIndex + 2} is missing a required value.`);
      }
      try {
        const url = new URL(jobLink);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error();
        }
      } catch {
        throw new Error(`CSV row ${rowIndex + 2} has an invalid job link.`);
      }
      const profileIds = includedNames.map((name) => {
        const id = resolveProfileId(name);
        if (!id) {
          throw new Error(`CSV row ${rowIndex + 2} has an unresolved profile.`);
        }
        return id;
      });
      const uniqueProfileIds = [...new Set(profileIds)];
      const profileResumes = uniqueProfileIds.flatMap((profileId) => {
        const profile = usedProfiles.find((item) => item.id === profileId);
        const header = profile ? resumeHeader(profile) : "";
        if (!header) {
          return [];
        }
        const resume = csvValue(table, row, header).trim();
        return resume ? [{ profileId, resume }] : [];
      });
      const bidAtValue = mapping.bidAt ? csvValue(table, row, mapping.bidAt) : "";
      let bidAt: Date;
      try {
        bidAt = parseCsvBidDate(bidAtValue, yearForYearlessDates);
      } catch {
        throw new Error(`CSV row ${rowIndex + 2} has an invalid bid date.`);
      }

      records.push({
        jobTitle,
        company,
        jobLink,
        bidAt: bidAt.toISOString(),
        jobMarketId,
        jobDescription: mapping.jobDescription
          ? plainTextToRichText(csvValue(table, row, mapping.jobDescription))
          : undefined,
        profileIds: uniqueProfileIds,
        profileResumes
      });
      if ((rowIndex + 1) % 500 === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }
    if (!records.length) {
      throw new Error(
        "No bids remain to import because every CSV row contains only ignored profiles."
      );
    }
    return records;
  }

  return (
    <Modal
      title="Bulk Import Bids"
      size="large"
      onClose={() => {
        if (!importLock.current && !importBusy) {
          onClose();
        }
      }}
    >
      <div className="modal-form bulk-import">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(event) => {
            if (importLock.current) {
              return;
            }
            const file = event.target.files?.[0];
            if (file) {
              void loadFile(file);
            }
          }}
        />
        <button
          className={`csv-drop-zone${table ? " has-file" : ""}`}
          type="button"
          disabled={importBusy}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (importLock.current || importBusy) {
              return;
            }
            const file = event.dataTransfer.files[0];
            if (file) {
              void loadFile(file);
            }
          }}
        >
          {table ? <FileSpreadsheet aria-hidden="true" /> : <Upload aria-hidden="true" />}
          <span>
            <strong>{table ? fileName : "Import or drag CSV here"}</strong>
            <small>
              {table ? `${table.rows.length} data rows` : "CSV only; processed in batches"}
            </small>
          </span>
        </button>

        {table && mapping ? (
          <>
            <section className="bulk-import-section">
              <h4>Preview</h4>
              <div className="table-wrap">
                <table className="csv-preview-table">
                  <thead>
                    <tr>
                      {table.headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.slice(0, 5).map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {table.headers.map((header, columnIndex) => (
                          <td key={`${header}-${columnIndex}`}>{row[columnIndex] || "-"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bulk-import-section">
              <h4>Map CSV Headers</h4>
              <div className="csv-mapping-grid">
                {(Object.keys(fieldLabels) as CsvBidField[]).map((field) => (
                  <label key={field}>
                    {fieldLabels[field]}
                    {requiredFields.includes(field) ? <span>Required</span> : null}
                    <select
                      value={mapping[field]}
                      disabled={importBusy}
                      onChange={(event) =>
                        setMapping((current) =>
                          current ? { ...current, [field]: event.target.value } : current
                        )
                      }
                    >
                      <option value="">Not mapped</option>
                      {table.headers.map((header) => (
                        <option value={header} key={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label>
                  Job market
                  <span>Selected manually</span>
                  <select
                    value={jobMarketId}
                    required
                    disabled={importBusy}
                    onChange={(event) => setJobMarketId(event.target.value)}
                  >
                    {markets.map((market) => (
                      <option value={market.id} key={market.id}>
                        {market.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Year for dates without year
                  <span>Used for values like 1/26</span>
                  <input
                    type="number"
                    min={1900}
                    max={2100}
                    step={1}
                    value={yearForYearlessDates}
                    disabled={importBusy}
                    onChange={(event) => setYearForYearlessDates(Number(event.target.value))}
                  />
                </label>
              </div>
            </section>

            {profileNames.length ? (
              <section className="bulk-import-section">
                <h4>Resolve Bid Profiles</h4>
                <p>
                  Uncheck profiles that should be ignored. Rows containing only ignored profiles
                  will be skipped.
                </p>
                <div className="csv-profile-resolution">
                  {profileNames.map((name) => {
                    const normalized = normalizeProfileName(name);
                    const matched = matchingProfile(name, profiles);
                    const request = requestsByName.get(normalized);
                    const resolvedId = resolveProfileId(name);
                    const included = isProfileIncluded(name);
                    const resolvedProfile = profiles.find((profile) => profile.id === resolvedId);
                    let resolutionMessage = "Profile not found";
                    if (!included) {
                      resolutionMessage = "Ignored for this import";
                    } else if (matched) {
                      resolutionMessage = `Automatically matched to ${matched.name}`;
                    } else if (request?.resolvedProfileId) {
                      resolutionMessage = `Approved as ${
                        resolvedProfile?.name ?? "workspace profile"
                      }`;
                    } else if (request?.status === "pending") {
                      resolutionMessage = "Waiting for admin approval";
                    } else if (request?.status === "denied") {
                      resolutionMessage = "Request denied";
                    }
                    return (
                      <article key={normalized}>
                        <div>
                          <strong>{name}</strong>
                          <span>{resolutionMessage}</span>
                        </div>
                        <label className="csv-profile-toggle">
                          <input
                            type="checkbox"
                            checked={included}
                            disabled={importBusy}
                            onChange={(event) => {
                              setIgnoredProfileNames((current) => ({
                                ...current,
                                [normalized]: !event.target.checked
                              }));
                              setFormError(null);
                            }}
                          />
                          Include
                        </label>
                        {included && !resolvedId && !request?.resolvedProfileId ? (
                          <button
                            className="secondary-action compact-action"
                            type="button"
                            disabled={requestMutation.isPending || request?.status === "pending"}
                            onClick={() => requestMutation.mutate(name)}
                          >
                            {requestMutation.isPending ? (
                              <LoaderCircle className="spin-icon" aria-hidden="true" />
                            ) : (
                              <Send aria-hidden="true" />
                            )}
                            {request?.status === "pending" ? "Requested" : "Request profile"}
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {usedProfiles.length ? (
              <section className="bulk-import-section">
                <h4>Map Resume Column Per Profile (Optional)</h4>
                <p>Map a column only when the CSV contains resume content for that profile.</p>
                <div className="csv-resume-mapping">
                  {usedProfiles.map((profile) => (
                    <label key={profile.id}>
                      {profile.name}
                      <select
                        value={resumeHeader(profile)}
                        disabled={importBusy}
                        onChange={(event) => {
                          setResumeColumnMap((current) => ({
                            ...current,
                            [profile.id]: event.target.value
                          }));
                          setFormError(null);
                        }}
                      >
                        <option value="">No resume column</option>
                        {table.headers.map((header) => (
                          <option value={header} key={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {hasDuplicateResumeColumns ? (
                  <p className="form-error">Each profile must use a different resume CSV column.</p>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {formError ? <p className="form-error">{formError}</p> : null}
        {requestMutation.isError ? (
          <p className="form-error">{errorMessage(requestMutation.error)}</p>
        ) : null}
        {importMutation.isError ? (
          <p className="form-error">{errorMessage(importMutation.error)}</p>
        ) : null}
        <div className="modal-actions">
          <button
            className="secondary-action"
            type="button"
            disabled={importBusy}
            onClick={() => {
              if (!importLock.current) {
                onClose();
              }
            }}
          >
            <X aria-hidden="true" />
            Cancel
          </button>
          <button
            className="primary-action small"
            type="button"
            disabled={!table || importBusy}
            onClick={() => {
              if (importLock.current) {
                return;
              }
              const configurationError = importConfigurationError();
              if (configurationError) {
                setFormError(configurationError);
                return;
              }
              importLock.current = true;
              setPreparingImport(true);
              setFormError(null);
              window.setTimeout(async () => {
                try {
                  importMutation.mutate(await buildRecords());
                } catch (error) {
                  importLock.current = false;
                  setPreparingImport(false);
                  setFormError(errorMessage(error));
                }
              }, 0);
            }}
          >
            {importBusy ? (
              <LoaderCircle className="spin-icon" aria-hidden="true" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {preparingImport ? "Preparing" : importMutation.isPending ? "Importing" : "Import bids"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
