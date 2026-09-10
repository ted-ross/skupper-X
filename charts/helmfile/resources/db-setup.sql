/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

--
-- CertificateRequestType
--   mgmtController  Generate a client certificate, signed by the rootCA, to be used by the management controller to connect to backbones
--   backboneCA      Generate a CA for an interior backbone, signed by the rootCA
--   interiorRouter  Generate a client certificate for an interior router, signed by the interiorCA
--   accessPoint     Generate a server certificate for an access point, served by one or more interior routers
--   vanCA           Generate a CA for an application network, signed by the rootCA
--   vanCredential   Generate a client certificate for a VAN to use to connect to the management backbone
--   memberClaim     Generate a claim certificate for invitees, signed by the vanCA
--   vanSite         Generate a client certificate for a joining member site, signed by the vanCA
--
CREATE TYPE CertificateRequestType AS ENUM ('mgmtController', 'backboneCA', 'interiorRouter', 'accessPoint', 'vanCA', 'vanCredential', 'memberClaim', 'vanSite');

--
-- AccessPointType
--   claim   Ingress for claim (normal) access
--   peer    Ingress for peer backbone router (inter-router) access
--   member  Ingress for member (edge) access
--   manage  Ingress for the management (normal) controller
--   van     Ingress for managed VANs (inter-network)
--
CREATE TYPE AccessPointType AS ENUM ('claim', 'peer', 'member', 'manage', 'van');

--
-- LifecycleType
--
-- Used to trace the lifecycle of various objects in the DB
--
--   partial            The object is partially specified.  There is not enough information yet to start the lifecycle.
--   new                A new object has been created
--   vms_cr_created     A CertificateRequest has been created for the object
--   cm_cert_created    A cert-manager Certificate object has been created
--   cm_issuer_created  A cert-manager Issuer object has been created
--   ready              The TlsCertificate is generated and linked to the object
--   active             For member or interior sites, the site has successfully joined the backbone
--   expired            The object is no longer available for use
--   failed             An unrecoverable error occurred while processing this row, see the Failure column for details
--
CREATE TYPE LifecycleType AS ENUM ('partial', 'new', 'vms_cr_created', 'cm_cert_created', 'cm_issuer_created', 'ready', 'active', 'expired', 'failed');

--
-- DeploymentStateType
--
-- Used to indicate what actions can be taken to deploy interior backbone sites
--
--   not-ready        The site is not ready to be deployed
--   ready-bootstrap  The site is ready to begin the bootstrap process for deployment
--   ready-bootfinish The site is ready to complete the bootstrap process
--   ready-automatic  The site is ready to be deployed by the automatic process
--   deployed         The site is deployed and has checked in with the management plane
--
CREATE TYPE DeploymentStateType AS ENUM ('not-ready', 'ready-bootstrap', 'ready-bootfinish', 'ready-automatic', 'colo-automatic', 'deployed');

--
-- ApplicationNetworkType
--
-- Indicates how an application network is onboarded and managed
--
--   tenant    The network is a tenant of a service backbone and is managed via invitations
--   external  The network was created externally and onboarded/managed via a backbone
--
CREATE TYPE ApplicationNetworkType AS ENUM ('tenant', 'external');

--
-- Database roles for connection pooling and RLS control
--
-- app_user: Regular application users, subject to RLS policies
-- app_system: System/background processes, bypasses RLS
--

\getenv APP_USER_PASSWORD APP_USER_PASSWORD
\getenv APP_SYSTEM_PASSWORD APP_SYSTEM_PASSWORD

CREATE ROLE app_user LOGIN PASSWORD :'APP_USER_PASSWORD';
CREATE ROLE app_system LOGIN PASSWORD :'APP_SYSTEM_PASSWORD';

-- Grant connect and usage permissions
GRANT CONNECT ON DATABASE postgres TO app_user;
GRANT CONNECT ON DATABASE postgres TO app_system;

--
-- Global configuration for VMS
--
CREATE TABLE Configuration (
    Id integer PRIMARY KEY CHECK (Id = 0),  -- Ensure that there's only one row in this table
    RootIssuer text,                        -- The name of the root-issuer for cert-manager
    BackboneCaExpiration interval,
    DefaultCaExpiration interval,
    DefaultCertExpiration interval,
    SiteControllerImage text,
    CertOrganization text
);

--
-- Users who have access to the service application
--
CREATE TABLE Users (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    KeycloakSub text UNIQUE NOT NULL,
    IsAdmin boolean DEFAULT false,
    Email text,
    DisplayName text,
    CreatedAt timestamptz DEFAULT CURRENT_TIMESTAMP,
    LastSeen timestamptz DEFAULT CURRENT_TIMESTAMP
);

--
-- Tracking of user login sessions in the service application
--
CREATE TABLE WebSessions (
    Id UUID PRIMARY KEY,
    UserId UUID REFERENCES Users ON DELETE CASCADE,
    StartTime timestamptz DEFAULT CURRENT_TIMESTAMP,
    EndTime timestamptz
);

--
-- x.509 certificates and certificate authorities
--
CREATE TABLE TlsCertificates (
    Id UUID PRIMARY KEY,
    IsCA boolean,
    ObjectName text,                           -- The name of the secret, certificate, and issuer objects in k8s
    SignedBy UUID REFERENCES TlsCertificates,  -- NULL => signed by the Root Issuer
    Expiration timestamptz,
    RenewalTime timestamptz,
    RotationOrdinal integer NOT NULL DEFAULT 0, -- successor ordinal = predecessor.RotationOrdinal + 1
    Supercedes UUID UNIQUE REFERENCES TlsCertificates, -- the TlsCertificate this row replaced; NULL for first issue
    Label text
);

--
-- Target platforms for interior and member sites
--
CREATE TABLE TargetPlatforms (
    ShortName      text PRIMARY KEY,
    LongName       text UNIQUE,
    SiteTemplate   text,
    TlsTemplate    text,
    AccessTemplate text,
    LinkTemplate   text
);

--
-- Interior backbone networks
--
-- There can be only one backbone that is designated as the management backbone
--
CREATE TABLE Backbones (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name text UNIQUE,
    Lifecycle LifecycleType DEFAULT 'new',
    Failure text,
    Certificate UUID REFERENCES TlsCertificates ON DELETE CASCADE,
    CoLocatedNamespace text UNIQUE DEFAULT NULL,
    Owner UUID REFERENCES Users,
    OwnerGroup text
);

--
-- Sites that form the interior transit backbone
--
-- The site's certificate is used as a client-auth certificate for outgoing inter-router links.
-- The access points are used as certificates/CAs for incoming connections on separate ingresses.
--
CREATE TABLE InteriorSites (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name text,
    Lifecycle LifecycleType DEFAULT 'new',
    Failure text,
    Certificate UUID REFERENCES TlsCertificates ON DELETE CASCADE,
    DeploymentState DeploymentStateType DEFAULT 'not-ready',
    TargetPlatform text REFERENCES TargetPlatforms,

    Metadata text,

    FirstActiveTime timestamptz,
    LastHeartbeat timestamptz,

    Backbone UUID REFERENCES Backbones,
    CoLocated boolean DEFAULT false,
    Owner UUID REFERENCES Users,   -- TODO - Remove these.  It doesn't make sense for a site to have a different owner than the backbone
    OwnerGroup text
);

--
-- Access URL for a subset of the interior routers in a backbone network.
-- This is either simply an ingress-spec for backbone listeners or it can be
-- used to configure global-DNS configuration for backbone access.
--
CREATE TABLE BackboneAccessPoints (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name text,
    Lifecycle LifecycleType DEFAULT 'partial',
    Failure text,
    Certificate UUID REFERENCES TlsCertificates,
    Hostname text,
    Port text,

    Kind AccessPointType,
    BindHost text DEFAULT '',
    InteriorSite UUID REFERENCES InteriorSites ON DELETE CASCADE,
    GlobalAccess UUID REFERENCES BackboneAccessPoints,
    Owner UUID REFERENCES Users,
    OwnerGroup text,
    AccessType text
);

--
-- Links that interconnect the interior transit backbone routers
--
CREATE TABLE InterRouterLinks (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    AccessPoint UUID REFERENCES BackboneAccessPoints ON DELETE CASCADE,
    ConnectingInteriorSite UUID REFERENCES InteriorSites ON DELETE CASCADE,
    Cost integer DEFAULT 1,
    Owner UUID REFERENCES Users,
    OwnerGroup text
);

--
-- Instances of redundant management controllers.
--
CREATE TABLE ManagementControllers (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name text UNIQUE,
    Lifecycle LifecycleType DEFAULT 'new',
    Failure text,
    Certificate UUID REFERENCES TlsCertificates
);

--
-- User-owned application networks
--
CREATE TABLE ApplicationNetworks (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name text,
    Lifecycle LifecycleType DEFAULT 'new',
    Failure text,
    Certificate UUID REFERENCES TlsCertificates,

    Backbone UUID REFERENCES Backbones (Id) ON DELETE CASCADE,
    NetworkType ApplicationNetworkType,
    Owner UUID REFERENCES Users,
    OwnerGroup text,
    VanId text,
    StartTime timestamptz DEFAULT now(),
    EndTime timestamptz,
    DeleteDelay interval second (0) DEFAULT '0 minutes',
    Connected boolean,
    LastHeartbeat timestamptz
);

CREATE TABLE NetworkCredentials (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name text,
    Lifecycle LifecycleType DEFAULT 'new',
    Failure text,
    Certificate UUID REFERENCES TlsCertificates,

    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE
);

--
-- Content of an invitation-to-participate in a VAN
--
CREATE TABLE MemberInvitations (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name text,
    Lifecycle LifecycleType DEFAULT 'new',
    Failure text,
    Certificate UUID REFERENCES TlsCertificates,

    ClaimAccess UUID REFERENCES BackboneAccessPoints,
    JoinDeadline timestamptz,
    MemberClasses text ARRAY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    InstanceLimit integer,                    -- NULL => no limit
    InstanceCount integer DEFAULT 0,
    FetchCount integer DEFAULT 0,
    InteractiveClaim boolean DEFAULT false,   -- If true, don't assert the claim until the invitee intervenes
    MemberNamePrefix text,
    RequiredMetadata text    -- A JSON map of metadata keys that must appear in the MemberSite and information about where
                             -- that metadata should come from (supplied by local operator, supplied here, from environment, ...)
);

--
-- Mapping of participant sites to their backbone attach point(s)
--
CREATE TABLE EdgeLinks (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    AccessPoint UUID REFERENCES BackboneAccessPoints ON DELETE CASCADE,
    EdgeToken UUID REFERENCES MemberInvitations ON DELETE CASCADE,
    Priority integer DEFAULT 4
);

--
-- Attached participant sites (accepted invitations)
--
CREATE TABLE MemberSites (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name text,
    Lifecycle LifecycleType DEFAULT 'new',
    Failure text,
    Certificate UUID REFERENCES TlsCertificates,

    FirstActiveTime timestamptz,
    LastHeartbeat timestamptz,

    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    Invitation UUID REFERENCES MemberInvitations ON DELETE CASCADE,
    SiteClasses text ARRAY,
    ActiveAccessPoint UUID REFERENCES BackboneAccessPoints,
    TargetPlatform text REFERENCES TargetPlatforms,
    Metadata text
);

--
-- Revoked client certificates
--
CREATE TABLE TlsClientRevocations (
    CertificateId UUID PRIMARY KEY REFERENCES TlsCertificates, -- Certificate revoked
    Expiration timestamptz,                                    -- When this revocation can be removed
    Reason text                                                -- Reason for the revocation
);

--
-- Pending requests for certificate generation
--
CREATE TABLE CertificateRequests (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    RequestType CertificateRequestType,
    Issuer UUID REFERENCES TlsCertificates (Id) ON DELETE CASCADE,  -- NULL for the root CA issuer
    Lifecycle LifecycleType DEFAULT 'new',
    Failure text,

    --
    -- Optional hostname for the certificate
    --
    Hostname text,

    --
    -- The time when this request row was created.  This should be used to determine the order of processing
    -- when there are multiple actionable requests in the table.  First-created, first-processed.
    --
    CreatedTime timestamptz,

    --
    -- If present, this is the time after which the request should be processed.  If the request time is in
    -- the future, this request is not at present eligible to be processed.
    --
    RequestTime timestamptz,

    --
    -- If present, this is the duration of the generated certificate.  If not present, a default
    -- (relatively long) expiration interval will be used.
    --
    DurationHours integer,

    --
    -- If set, this request replaces an existing TlsCertificates row (rotation)
    -- rather than first-issue. secretAdded uses this to preserve owner Lifecycle.
    --
    Supercedes UUID REFERENCES TlsCertificates,

    --
    -- Link to the requesting
    --
    ManagementController UUID REFERENCES ManagementControllers (Id) ON DELETE CASCADE,
    Backbone UUID REFERENCES Backbones (Id) ON DELETE CASCADE,
    InteriorSite UUID REFERENCES InteriorSites (Id) ON DELETE CASCADE,
    AccessPoint UUID REFERENCES BackboneAccessPoints (Id) ON DELETE CASCADE,
    ApplicationNetwork UUID REFERENCES ApplicationNetworks (Id) ON DELETE CASCADE,
    NetworkCredential UUID REFERENCES NetworkCredentials (Id) ON DELETE CASCADE,
    Invitation UUID REFERENCES MemberInvitations (Id) ON DELETE CASCADE,
    Site UUID REFERENCES MemberSites (Id) ON DELETE CASCADE
);

--
-- Pre-populate the database with some test data.
--
INSERT INTO Configuration (Id, RootIssuer, DefaultCaExpiration, DefaultCertExpiration, BackboneCaExpiration, SiteControllerImage, CertOrganization)
    VALUES (0, 'vms-root', '1 year', '90 days', '5 years', 'quay.io/skupper/vms-site-controller:latest', 'enterprise.com');

INSERT INTO TargetPlatforms (ShortName, LongName) VALUES
    ('sk2',      'Kubernetes/OpenShift'),
    ('podman',   'Podman'),
    ('docker',   'Docker'),
    ('linux',    'Linux'),
    ('m-server', 'Co-located with the management server');

-- Function to check if the current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
    RETURN current_setting('session.is_admin', true)::boolean;
END;
$$ LANGUAGE plpgsql STABLE;

-- RLS policies
CREATE POLICY user_access_backbones_policy
ON Backbones
FOR ALL
USING (
    Owner = NULLIF(current_setting('session.user_id', true), '')::uuid
    OR
    is_admin()
);

CREATE POLICY group_access_backbones_policy
ON Backbones
FOR ALL
USING (
    OwnerGroup = 'public'
    OR
    OwnerGroup = ANY(current_setting('session.user_groups', true)::text[])
);

CREATE POLICY user_access_application_networks_policy
ON ApplicationNetworks
FOR ALL
USING (
    Owner = NULLIF(current_setting('session.user_id', true), '')::uuid
    OR
    is_admin()
);

CREATE POLICY group_access_application_networks_policy
ON ApplicationNetworks
FOR ALL
USING (
    OwnerGroup = 'public'
    OR
    OwnerGroup = ANY(current_setting('session.user_groups', true)::text[])
);

CREATE POLICY user_access_backbone_access_points_policy
ON BackboneAccessPoints
FOR ALL
USING (
    Owner = NULLIF(current_setting('session.user_id', true), '')::uuid
    OR
    is_admin()
);

CREATE POLICY group_access_backbone_access_points_policy
ON BackboneAccessPoints
FOR ALL
USING (
    OwnerGroup = 'public'
    OR
    OwnerGroup = ANY(current_setting('session.user_groups', true)::text[])
);

CREATE POLICY user_access_interior_sites_policy
ON InteriorSites
FOR ALL
USING (
    Owner = NULLIF(current_setting('session.user_id', true), '')::uuid
    OR
    is_admin()
);

CREATE POLICY group_access_interior_sites_policy
ON InteriorSites
FOR ALL
USING (
    OwnerGroup = 'public'
    OR
    OwnerGroup = ANY(current_setting('session.user_groups', true)::text[])
);

CREATE POLICY user_access_inter_router_links_policy
ON InterRouterLinks
FOR ALL
USING (
    Owner = NULLIF(current_setting('session.user_id', true), '')::uuid
    OR
    is_admin()
);

CREATE POLICY group_access_inter_router_links_policy
ON InterRouterLinks
FOR ALL
USING (
    OwnerGroup = 'public'
    OR
    OwnerGroup = ANY(current_setting('session.user_groups', true)::text[])
);

ALTER TABLE Backbones ENABLE ROW LEVEL SECURITY;
ALTER TABLE ApplicationNetworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE BackboneAccessPoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE InteriorSites ENABLE ROW LEVEL SECURITY;
ALTER TABLE InterRouterLinks ENABLE ROW LEVEL SECURITY;

-- Grant permissions to roles
-- app_user gets standard permissions (subject to RLS)
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- app_system bypass RLS (they have BYPASSRLS attribute)
ALTER ROLE app_system BYPASSRLS;

GRANT USAGE ON SCHEMA public TO app_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_system;

-- index owner and ownergroup columns for better performance
CREATE INDEX idx_backbones_owner ON Backbones (Owner);
CREATE INDEX idx_backbones_ownergroup ON Backbones (OwnerGroup);
CREATE INDEX idx_application_networks_owner ON ApplicationNetworks (Owner);
CREATE INDEX idx_application_networks_ownergroup ON ApplicationNetworks (OwnerGroup);
CREATE INDEX idx_backbone_access_points_owner ON BackboneAccessPoints (Owner);
CREATE INDEX idx_backbone_access_points_ownergroup ON BackboneAccessPoints (OwnerGroup);
CREATE INDEX idx_interior_sites_owner ON InteriorSites (Owner);
CREATE INDEX idx_interior_sites_ownergroup ON InteriorSites (OwnerGroup);
CREATE INDEX idx_inter_router_links_owner ON InterRouterLinks (Owner);
CREATE INDEX idx_inter_router_links_ownergroup ON InterRouterLinks (OwnerGroup);

/*
Notes:

  - (DONE) Consider a "service-link" type that represents a service-specific relationship between a specified set of processes or [in,e]gresses.
      o Ties "required" services to "provided" services
      o Owns the VAN address for the service-link, including scope-specific sub-addresses
      o Specifies the distribution of payload: anycast, multicast

  - Use ServiceLink to manage advanced routing (A/B, Blue/Green, incremental image upgrade, tee/tap, etc.)

  - Associate API-Management to ingresses and egresses (auth, accounting, etc.).

  - (DONE) Consider generalizing "offers" and "requires" as roles on a ServiceLink.  This allows the addition of more roles.
    Such roles should probably be renamed "connects" and "accepts".

  - Take into account the fact that there may be multiple routers in an interior site.  OR define that there can only be one router per backbone site.

  - Keep in mind that an entire application network should be deployable via gitops.  This means that an already-created
    application network should be able to be populated with components and service-links via gitops.

  - Components should be allocatable to multiple classes/sites.

  - Allow for partially configured ingress/egress components, where the participant can supply the
    missing data locally.

  - (DONE) Consider allowing for multiple, disjoint backbone networks.

  - Add a pre-start buffer time to the lifecycle of ApplicationNetworks (default 5-minutes) so that
    invitations can be activated before the exact start time.

  - Problem:  Figure out how to issue invitations well prior to the start time of ApplicationNetworks.
    Perhaps use the backbone CA to sign claims.
       o Generate van CAs immediately to sign invitations but don't install the van CAs until the pre-start time.

  - Add state to the invitation that controls whether the participant may or may not create their own interfaces in the
    application network.  If not permitted, the participant is limited to only using the allocated interfaces.

  - (DONE) Consider issuing a certificate per backbone-access point that contains the hostname of the access point.

*/
