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
-- AddressScopeType
--   van       All instances offering a service use the same address, VAN-wide.
--   site      Service addresses are site-specific. All instances at a site use the same address.
--   instance  Each instance of a service uses a site/instance-specific address.
--
CREATE TYPE AddressScopeType AS ENUM ('van', 'site', 'instance');

--
-- StickyMechanismType
--   none           Client sessions are not sticky
--   sourceAddress  Client connections from the same address are sent to the same instance
--   cookie         Client proxy inserts a cookie to track clients and direct them to the same instance
--
CREATE TYPE StickyMechanismType AS ENUM ('none', 'sourceAddress', 'cookie');

--
-- DistributionType
--   anycast    Payload will be delivered to exactly one service instance
--   multicast  Payload will de delivered to every service instance exactly once
--   forbidden  Payload will not be delivered
--
CREATE TYPE DistributionType AS ENUM ('anycast', 'multicast', 'forbidden');

--
-- CertificateRequestType
--   mgmtController  Generate a client certificate, signed by the rootCA, to be used by the management controller to connect to backbones
--   backboneCA      Generate a CA for an interior backbone, signed by the rootCA
--   interiorRouter  Generate a client certificate for an interior router, signed by the interiorCA
--   accessPoint     Generate a server certificate for an access point, served by one or more interior routers
--   vanCA           Generate a CA for an application network, signed by the rootCA
--   memberClaim     Generate a claim certificate for invitees, signed by the vanCA
--   vanSite         Generate a client certificate for a joining member site, signed by the vanCA
--
CREATE TYPE CertificateRequestType AS ENUM ('mgmtController', 'backboneCA', 'interiorRouter', 'accessPoint', 'vanCA', 'memberClaim', 'vanSite');

--
-- AccessPointType
--   claim   Ingress for claim (normal) access
--   peer    Ingress for peer backbone router (inter-router) access
--   member  Ingress for member (edge) access
--   manage  Ingress for the management (normal) controller
--
CREATE TYPE AccessPointType AS ENUM ('claim', 'peer', 'member', 'manage');

--
-- RoleType
--   accept        Accepts incoming connections
--   connect       Initiates outgoing connections
--   send          Sends datagrams or messages
--   receive       Receives datagrams or messages
--   asyncRequest  Sends asynchronous requests
--   asyncReply    Replies asynchronously to requests
--   peer          Represents a host or subnet attached via a raw-IP encapsulation
--
CREATE TYPE RoleType AS ENUM ('accept', 'connect', 'send', 'receive', 'asyncRequest', 'asyncReply', 'peer');

--
-- LifecycleType
--
-- Used to trace the lifecycle of various objects in the DB
--
--   partial            The object is partially specified.  There is not enough information yet to start the lifecycle.
--   new                A new object has been created
--   skx_cr_created     A CertificateRequest has been created for the object
--   cm_cert_created    A cert-manager Certificate object has been created
--   cm_issuer_created  A cert-manager Issuer object has been created
--   ready              The TlsCertificate is generated and linked to the object
--   active             For member or interior sites, the site has successfully joined the backbone
--   expired            The object is no longer available for use
--   failed             An unrecoverable error occurred while processing this row, see the Failure column for details
--
CREATE TYPE LifecycleType AS ENUM ('partial', 'new', 'skx_cr_created', 'cm_cert_created', 'cm_issuer_created', 'ready', 'active', 'expired', 'failed');

--
-- Global configuration for Skupper-X
--
CREATE TABLE Configuration (
    Id integer PRIMARY KEY CHECK (Id = 0),  -- Ensure that there's only one row in this table
    RootIssuer text,                        -- The name of the root-issuer for cert-manager
    BackboneCaExpiration interval,
    DefaultCaExpiration interval,
    DefaultCertExpiration interval,
    SiteDataplaneImage text,
    BackboneControllerImage text,
    ConfigSyncImage text,
    SiteControllerImage text,
    EdgeControllerImage text,
    VaultURL text,
    VaultToken text
);

--
-- Users who have access to the service application
--
CREATE TABLE Users (
    Id integer PRIMARY KEY,
    DisplayName text,
    Email text,
    PasswordHash text
);

--
-- Tracking of user login sessions in the service application
--
CREATE TABLE WebSessions (
    Id UUID PRIMARY KEY,
    UserId integer REFERENCES Users ON DELETE CASCADE,
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
    RenewalTime timestamptz
);

--
-- Interior backbone networks
--
CREATE TABLE Backbones (
    Id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    Name text UNIQUE,
    Lifecycle LifecycleType DEFAULT 'new',
    Failure text,
    Certificate UUID REFERENCES TlsCertificates,

    MultiTenant boolean DEFAULT true
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
    Backbone UUID REFERENCES Backbones
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
    Certificate UUID REFERENCES TlsCertificates,

    FirstActiveTime timestamptz,
    LastHeartbeat timestamptz,
    Backbone UUID REFERENCES Backbones,
    ClaimAccess UUID REFERENCES BackboneAccessPoints,
    PeerAccess UUID REFERENCES BackboneAccessPoints,
    MemberAccess UUID REFERENCES BackboneAccessPoints,
    ManagementAccess UUID REFERENCES BackboneAccessPoints
);

--
-- Links that interconnect the interior transit backbone routers
--
CREATE TABLE InterRouterLinks (
    ListeningInteriorSite UUID REFERENCES InteriorSites ON DELETE CASCADE,
    ConnectingInteriorSite UUID REFERENCES InteriorSites ON DELETE CASCADE,
    Cost integer DEFAULT 1
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
    Owner integer REFERENCES Users,
    VanId text,
    StartTime timestamptz DEFAULT now(),
    EndTime timestamptz,
    DeleteDelay interval second (0) DEFAULT '0 minutes'
);

--
-- VAN-specific site classes
--
CREATE TABLE SiteClasses (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    Name text,
    Description text
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
    MemberClass UUID REFERENCES SiteClasses,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    InstanceLimit integer,
    InstanceCount integer,
    InteractiveClaim boolean DEFAULT false    -- If true, don't assert the claim until the invitee intervenes
);

--
-- Mapping of participant sites to their backbone attach point(s)
--
CREATE TABLE EdgeLinks (
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

    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    Invitation UUID REFERENCES MemberInvitations ON DELETE CASCADE,
    SiteClass UUID REFERENCES SiteClasses,
    ActiveAccessPoint UUID REFERENCES BackboneAccessPoints
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

    VanId text,

    --
    -- Link to the requesting
    --
    ManagementController UUID REFERENCES ManagementControllers (Id) ON DELETE CASCADE,
    Backbone UUID REFERENCES Backbones (Id) ON DELETE CASCADE,
    InteriorSite UUID REFERENCES InteriorSites (Id) ON DELETE CASCADE,
    AccessPoint UUID REFERENCES BackboneAccessPoints (Id) ON DELETE CASCADE,
    ApplicationNetwork UUID REFERENCES ApplicationNetworks (Id) ON DELETE CASCADE,
    Invitation UUID REFERENCES MemberInvitations (Id) ON DELETE CASCADE,
    Site UUID REFERENCES MemberSites (Id) ON DELETE CASCADE
);


-- ===================================================================================
-- Everything from this point down is in a more preliminary state than the stuff above.
-- ===================================================================================

--
-- Available process images
-- RENAME: ComponentTypes
--
CREATE TABLE ComponentTypes (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE, -- optional in case of image-library
    Name text,
    Description text,
    KubernetesConfig text
);

--
-- Services offered by processes
-- RENAME: InterfaceTypes
--
CREATE TABLE InterfaceTypes (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE, -- optional in case of service-library
    Name text,
    Description text,
    Protocol text,
    DefaultPort text,
    StickyMechanism StickyMechanismType DEFAULT 'none',
    Distribution DistributionType DEFAULT 'anycast',
    AddressScope AddressScopeType DEFAULT 'van'
);

--
-- Mapping of services to the components that participate in that service
-- RENAME: Interfaces
--
CREATE TABLE Interfaces (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE, -- optional
    ComponentType UUID REFERENCES ComponentTypes,
    InterfaceType UUID REFERENCES InterfaceTypes,
    Role RoleType,
    HostNameUsed text,
    ActualPort text
);

--
-- A Component is an instance of a participant in a ServicLink that is allocated to
-- one or more sites in an ApplicationNetwork.
--
CREATE TABLE Components (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    SiteClass UUID REFERENCES SiteClasses,
    Site UUID REFERENCES MemberSites,
    ComponentType UUID REFERENCES ComponentTypes,
    IngressHost text
);

--
-- Specific interconnect between running images and endpoints
-- RENAME: Bindings
--
CREATE TABLE Bindings (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    InterfaceType UUID REFERENCES InterfaceTypes,
    VanAddress text,
    Distribution DistributionType DEFAULT 'anycast',
    Scope AddressScopeType DEFAULT 'van'
);

--
-- RENAME: InterfaceBindings - This table needs to be re-thinked
--
CREATE TABLE InterfaceBindings (
    MemberOf   UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    Component  UUID REFERENCES Components          ON DELETE CASCADE, -- Should this be a ServiceAttach?
    Interface  UUID REFERENCES Interfaces          ON DELETE CASCADE, -- Is this needed?
    Role RoleType
);


--
-- Pre-populate the database with some test data.
--
INSERT INTO Configuration (Id, RootIssuer, DefaultCaExpiration, DefaultCertExpiration, BackboneCaExpiration, SiteDataplaneImage, BackboneControllerImage, ConfigSyncImage, SiteControllerImage)
    VALUES (0, 'skupperx-root', '30 days', '1 week', '1 year', 'quay.io/tedlross/skupper-router:skx-0.1.1', 'quay.io/tedlross/skupperx-bb-controller:skx-0.1.1', 'quay.io/tedlross/skupper-config-sync:skx-0.1.1', 'quay.io/tedlross/skupper-site-controller:skx-0.1.1');
INSERT INTO Users (Id, DisplayName, Email, PasswordHash) VALUES (1, 'Ted Ross', 'tross@redhat.com', '18f4e1168a37a7a2d5ac2bff043c12c862d515a2cbb9ab5fe207ab4ef235e129c1a475ffca25c4cb3831886158c3836664d489c98f68c0ac7af5a8f6d35e04fa');
INSERT INTO WebSessions (Id, UserId) VALUES (gen_random_uuid(), 1);


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

  - Take into account the fact that there may be multiple routers in an interior site.

  - Keep in mind that an entire application network should be deployable via gitops.  This means that an already-created
    application network should be able to be poplated with components and service-links via gitops.

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

  - Consider issuing a certificate per backbone-access point that contains the hostname of the access point.

*/

