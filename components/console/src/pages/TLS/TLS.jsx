import React, { useState, useEffect, useMemo } from "react";
import {
    Breadcrumb,
    BreadcrumbItem,
    Table,
    TableHead,
    TableRow,
    TableHeader,
    TableBody,
    TableCell,
    TableContainer,
    TableExpandRow,
    TableExpandedRow,
    TableExpandHeader,
    Tag,
    InlineNotification,
    Loading,
    OverflowMenu,
    OverflowMenuItem,
} from "@carbon/react";
import { Certificate, DocumentSigned } from "@carbon/icons-react";
import { CancelWatch, CreateWatch } from "../../tools/watch";

const certsUrl = ({ signedBy } = {}) => {
    if (signedBy) {
        return `/api/v1alpha1/certs?signedby=${signedBy}`;
    }
    return "/api/v1alpha1/certs";
};

const collectKnownCerts = (rootCerts, childrenByIssuer) => {
    const byId = new Map();
    for (const cert of rootCerts) {
        byId.set(cert.id, cert);
    }
    for (const children of Object.values(childrenByIssuer)) {
        if (!Array.isArray(children)) {
            continue;
        }
        for (const cert of children) {
            byId.set(cert.id, cert);
        }
    }
    return [...byId.values()];
};

const isCertSuperseded = (cert, knownCerts) => {
    if (cert.superseded === true) {
        return true;
    }
    if (knownCerts.some((other) => other.supercedes === cert.id)) {
        return true;
    }
    if (!cert.objectname) {
        return false;
    }
    const ordinal = cert.rotationordinal ?? 0;
    return knownCerts.some(
        (other) => other.objectname === cert.objectname && (other.rotationordinal ?? 0) > ordinal
    );
};

const sortCertsActiveFirst = (certs, knownCerts) =>
    [...certs].sort((a, b) => {
        const aSuperseded = isCertSuperseded(a, knownCerts);
        const bSuperseded = isCertSuperseded(b, knownCerts);
        if (aSuperseded !== bSuperseded) {
            return aSuperseded ? 1 : -1;
        }
        return (a.label || a.id).localeCompare(b.label || b.id);
    });

const postCertAction = async (certId, action) => {
    const response = await fetch(`/api/v1alpha1/certs/${certId}/${action}`, {
        method: "POST",
    });
    if (!response.ok) {
        const text = await response.text();
        const error = new Error(text || `HTTP error! status: ${response.status}`);
        error.status = response.status;
        throw error;
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return response.json();
    }
    return null;
};

const TLS = () => {
    const [certificates, setCertificates] = useState([]);
    const [childCerts, setChildCerts] = useState({});
    const [loadingChildren, setLoadingChildren] = useState({});
    const [expandedRows, setExpandedRows] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionNotice, setActionNotice] = useState(null);
    const [actionBusy, setActionBusy] = useState(false);

    const expandedIssuerIds = useMemo(
        () =>
            Object.entries(expandedRows)
                .filter(([, isExpanded]) => isExpanded)
                .map(([id]) => id)
                .sort((a, b) => a.localeCompare(b))
                .join(","),
        [expandedRows]
    );

    useEffect(() => {
        setExpandedRows({});
        setChildCerts({});
        setLoadingChildren({});
        setLoading(true);
        setError(null);

        const watchContext = CreateWatch(certsUrl(), function (message) {
            const body = message.body;
            if (body.method === "GET" || body.method === "UPDATE") {
                if (body.statusCode >= 200 && body.statusCode < 300) {
                    setCertificates(body.content);
                    setError(null);
                    setLoading(false);
                } else {
                    setError(body.content);
                    setLoading(false);
                }
            }
        });

        return () => {
            CancelWatch(watchContext);
        };
    }, []);

    useEffect(() => {
        if (!expandedIssuerIds) {
            return undefined;
        }

        const issuerIds = expandedIssuerIds.split(",");
        setLoadingChildren((prev) => {
            const next = { ...prev };
            let changed = false;
            for (const issuerId of issuerIds) {
                if (next[issuerId] !== false) {
                    next[issuerId] = true;
                    changed = true;
                }
            }
            return changed ? next : prev;
        });

        const watches = issuerIds.map((issuerId) =>
            CreateWatch(certsUrl({ signedBy: issuerId }), function (message) {
                const body = message.body;
                if (body.method === "GET" || body.method === "UPDATE") {
                    if (body.statusCode >= 200 && body.statusCode < 300) {
                        setChildCerts((prev) => ({ ...prev, [issuerId]: body.content }));
                    }
                    setLoadingChildren((prev) => ({ ...prev, [issuerId]: false }));
                }
            })
        );

        return () => {
            watches.forEach(CancelWatch);
        };
    }, [expandedIssuerIds]);

    const knownCerts = useMemo(
        () => collectKnownCerts(certificates, childCerts),
        [certificates, childCerts]
    );

    const sortedRootCerts = useMemo(
        () => sortCertsActiveFirst(certificates, knownCerts),
        [certificates, knownCerts]
    );

    const formatDate = (dateString) => {
        if (!dateString) return "N/A";
        const date = new Date(dateString);
        return date.toLocaleString();
    };

    const formatRelativeTime = (dateString) => {
        if (!dateString) return "N/A";
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = date - now;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return "Expired";
        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "Tomorrow";
        return `${diffDays} days`;
    };

    const getExpirationTagType = (expirationDate) => {
        if (!expirationDate) return "gray";
        const date = new Date(expirationDate);
        const now = new Date();
        const diffDays = Math.floor((date - now) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) return "red";
        if (diffDays <= 7) return "red";
        if (diffDays <= 14) return "yellow";
        return "green";
    };

    const renderIcon = (isCA) => {
        return isCA ? (
            <Certificate size={20} style={{ marginRight: "0.5rem" }} />
        ) : (
            <DocumentSigned size={20} style={{ marginRight: "0.5rem" }} />
        );
    };

    const handleRotate = async (cert) => {
        if (isCertSuperseded(cert, knownCerts)) {
            return;
        }
        try {
            setActionBusy(true);
            setActionNotice(null);
            await postCertAction(cert.id, "rotate");
            setActionNotice({
                kind: "success",
                title: "Certificate rotation requested",
                subtitle: cert.label || cert.id,
            });
        } catch (err) {
            setActionNotice({
                kind: "error",
                title:
                    err.status === 409 ? "Cannot rotate certificate" : "Error rotating certificate",
                subtitle: err.message,
            });
        } finally {
            setActionBusy(false);
        }
    };

    const handleRevoke = (_cert) => {
        // Revocation is not implemented yet.
    };

    const renderCertActions = (cert) => {
        const superseded = isCertSuperseded(cert, knownCerts);
        return (
            <OverflowMenu size="sm" flipped disabled={superseded}>
                <OverflowMenuItem
                    itemText="Rotate"
                    disabled={actionBusy || superseded}
                    title={superseded ? "Certificate has been superseded" : undefined}
                    onClick={() => handleRotate(cert)}
                />
                <OverflowMenuItem
                    itemText="Revoke"
                    isDelete
                    disabled
                    onClick={() => handleRevoke(cert)}
                />
            </OverflowMenu>
        );
    };

    const renderGenerationCell = (cert, superseded) => (
        <TableCell>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {cert.rotationordinal ?? 0}
                {superseded && (
                    <Tag type="gray" size="sm">
                        Superseded
                    </Tag>
                )}
            </div>
        </TableCell>
    );

    const headers = [
        { key: "type", header: "Type" },
        { key: "label", header: "Label" },
        { key: "expiration", header: "Expiration" },
        { key: "renewaltime", header: "Renewal Time" },
        { key: "rotationordinal", header: "Gen" },
        { key: "actions", header: "" },
    ];

    // Recursive component to render certificate rows at any depth
    const CertificateRow = ({ cert, level = 0 }) => {
        const isExpanded = expandedRows[cert.id] || false;
        const children = childCerts[cert.id] || [];
        const isLoadingChildren = loadingChildren[cert.id] || false;
        const superseded = isCertSuperseded(cert, knownCerts);
        const rowClassName = superseded ? "tls-cert-row--superseded" : undefined;

        const handleExpand = () => {
            setExpandedRows((prev) => ({
                ...prev,
                [cert.id]: !prev[cert.id],
            }));
        };

        const indentStyle = {
            paddingLeft: `${level * 2}rem`,
        };

        if (cert.isca) {
            // CA certificates - use TableExpandRow
            return (
                <React.Fragment key={cert.id}>
                    <TableExpandRow
                        isExpanded={isExpanded}
                        onExpand={handleExpand}
                        className={rowClassName}
                    >
                        <TableCell>
                            <div style={{ display: "flex", alignItems: "center", ...indentStyle }}>
                                {renderIcon(true)}
                                Certificate Authority
                            </div>
                        </TableCell>
                        <TableCell>{cert.label}</TableCell>
                        <TableCell>
                            <Tag type={getExpirationTagType(cert.expiration)}>
                                {formatRelativeTime(cert.expiration)}
                            </Tag>
                        </TableCell>
                        <TableCell>{formatDate(cert.renewaltime)}</TableCell>
                        {renderGenerationCell(cert, superseded)}
                        <TableCell>{renderCertActions(cert)}</TableCell>
                    </TableExpandRow>
                    {isExpanded && isLoadingChildren && (
                        <TableExpandedRow colSpan={headers.length + 1}>
                            <div style={{ padding: "1rem" }}>
                                <Loading description="Loading signed certificates..." small />
                            </div>
                        </TableExpandedRow>
                    )}
                    {isExpanded && !isLoadingChildren && children.length === 0 && (
                        <TableExpandedRow colSpan={headers.length + 1}>
                            <div style={{ padding: "1rem", color: "var(--cds-text-secondary)" }}>
                                No certificates signed by this CA
                            </div>
                        </TableExpandedRow>
                    )}
                    {isExpanded &&
                        !isLoadingChildren &&
                        children.length > 0 &&
                        sortCertsActiveFirst(children, knownCerts).map((childCert) => (
                            <CertificateRow key={childCert.id} cert={childCert} level={level + 1} />
                        ))}
                </React.Fragment>
            );
        } else {
            // Non-CA certificates - always need empty cell for expand column
            return (
                <TableRow key={cert.id} className={rowClassName}>
                    <TableCell />
                    <TableCell>
                        <div style={{ display: "flex", alignItems: "center", ...indentStyle }}>
                            {renderIcon(false)}
                            Certificate
                        </div>
                    </TableCell>
                    <TableCell>{cert.label}</TableCell>
                    <TableCell>
                        <Tag type={getExpirationTagType(cert.expiration)}>
                            {formatRelativeTime(cert.expiration)}
                        </Tag>
                    </TableCell>
                    <TableCell>{formatDate(cert.renewaltime)}</TableCell>
                    {renderGenerationCell(cert, superseded)}
                    <TableCell>{renderCertActions(cert)}</TableCell>
                </TableRow>
            );
        }
    };

    return (
        <div className="page-container">
            <Breadcrumb>
                <BreadcrumbItem href="/">Dashboard</BreadcrumbItem>
                <BreadcrumbItem href="/tls" isCurrentPage>
                    TLS
                </BreadcrumbItem>
            </Breadcrumb>

            <div className="page-header">
                <h1>TLS Certificates</h1>
                <p>
                    Manage Transport Layer Security certificates and certificate authorities. Click
                    on CAs to view signed certificates.
                </p>
            </div>

            {loading && <Loading description="Loading certificates..." withOverlay={false} />}

            {error && (
                <InlineNotification
                    kind="error"
                    title="Error loading certificates"
                    subtitle={error}
                    onCloseButtonClick={() => setError(null)}
                    style={{ marginBottom: "1rem" }}
                />
            )}

            {actionNotice && (
                <InlineNotification
                    kind={actionNotice.kind}
                    title={actionNotice.title}
                    subtitle={actionNotice.subtitle}
                    onCloseButtonClick={() => setActionNotice(null)}
                    style={{ marginBottom: "1rem" }}
                />
            )}

            {!loading && !error && certificates.length === 0 && (
                <InlineNotification
                    kind="info"
                    title="No certificates found"
                    subtitle="There are currently no certificates configured."
                    hideCloseButton
                    style={{ marginBottom: "1rem" }}
                />
            )}

            {!loading && !error && certificates.length > 0 && (
                <TableContainer
                    title="Certificates"
                    description="Hierarchical view of certificate authorities and certificates"
                >
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableExpandHeader enableToggle />
                                {headers.map((header) => (
                                    <TableHeader key={header.key}>{header.header}</TableHeader>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {sortedRootCerts.map((cert) => (
                                <CertificateRow key={cert.id} cert={cert} level={0} />
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </div>
    );
};

export default TLS;

// Made with Bob
