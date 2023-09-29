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
--   interiorRouter  Generate a certificate for an interior router, signed by the interiorCA
--   vanCA           Generate a CA for an application network, signed by the rootCA
--   memberClaim     Generate a claim certificate for invitees, signed by the vanCA
--   vanSite         Generate a certificate for a joining member site, signed by the vanCA
--
CREATE TYPE CertificateRequestType AS ENUM ('interiorRouter', 'vanCA', 'memberClaim', 'vanSite');

--
-- RoleType
--   accept        Accepts incoming connections
--   connect       Initiates outgoing connections
--   send          Sends datagrams or messages
--   receive       Receives datagrams or messages
--   asyncRequest  Sends asynchronous requests
--   asyncReply    Replies asynchronously to requests
--
CREATE TYPE RoleType AS ENUM ('accept', 'connect', 'send', 'receive', 'asyncRequest', 'asyncReply');

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
    StartTime timestamp (0) with time zone DEFAULT CURRENT_TIMESTAMP,
    EndTime timestamp (0) with time zone
);

--
-- x.509 certificates and certificate authorities
--
CREATE TABLE TlsCertificates (
    Id UUID PRIMARY KEY,
    IsServiceRoot boolean,
    IsCA boolean,
    SecretName text,
    SignedBy UUID REFERENCES TlsCertificates,  -- NULL => self-signed
    Expiration timestamp (0) with time zone
);

--
-- Sites that form the interior transit backbone
--
CREATE TABLE InteriorSites (
    Id text PRIMARY KEY,
    InterRouterCertificate UUID REFERENCES TlsCertificates
);

--
-- Links that interconnect the interior transit backbone routers
--
CREATE TABLE InterRouterLinks (
    ListeningInteriorSite text REFERENCES InteriorSites ON DELETE CASCADE,
    ConnectingInteriorSite text REFERENCES InteriorSites ON DELETE CASCADE,
    Cost integer DEFAULT 1
);

--
-- User-owned application networks
--
CREATE TABLE ApplicationNetworks (
    Id UUID PRIMARY KEY,
    Name text,
    Owner integer REFERENCES Users,
    CertificateAuthority UUID REFERENCES TlsCertificates,
    StartTime timestamp (0) with time zone,
    EndTime timestamp (0) with time zone,
    DeleteDelay interval second (0)
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
    Id UUID PRIMARY KEY,
    label text,
    JoinDeadline timestamp (0) with time zone,
    MemberClass UUID REFERENCES SiteClasses,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    ClaimCertificate UUID REFERENCES TlsCertificates,
    InstanceLimit integer,
    InstanceCount integer
);

--
-- Mapping of participant sites to their backbone attach point(s)
--
CREATE TABLE EdgeLinks (
    InteriorSite text REFERENCES InteriorSites ON DELETE CASCADE,
    EdgeToken UUID REFERENCES MemberInvitations ON DELETE CASCADE,
    Priority integer DEFAULT 4
);

--
-- Attached participant sites (accepted invitations)
--
CREATE TABLE MemberSites (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    Invitation UUID REFERENCES MemberInvitations ON DELETE CASCADE,
    Label text,
    SiteClass UUID REFERENCES SiteClasses,
    ActiveAccessPoint text REFERENCES InteriorSites
);

--
-- Pending requests for certificate generation
--
CREATE TABLE CertificateRequests (
    Id UUID PRIMARY KEY,
    RequestType CertificateRequestType,

    --
    -- The time when this request row was created.  This should be used to determine the order of processing
    -- when there are multiple actionable requests in the table.  First-created, first-processed.
    --
    CreatedTime timestamp (0) with time zone,

    --
    -- If present, this is the time after which the request should be processed.  If the request time is in
    -- the future, this request is not at present eligible to be processed.
    --
    RequestTime timestamp (0) with time zone,

    --
    -- If present, this is the time that the generated certificate should expire.  If not present, a default
    -- (relatively long) expiration interval will be used.
    --
    ExpireTime timestamp (0) with time zone,
    InteriorRouter text REFERENCES InteriorSites (Id),
    ApplicationNetwork UUID REFERENCES ApplicationNetworks (Id),
    Invitation UUID REFERENCES MemberInvitations (Id),
    Site UUID REFERENCES MemberSites (Id)
);

--
-- Available process images
--
CREATE TABLE ImageTemplates (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE, -- optional
    Name text,
    Description text,
    KubernetesConfig text
);

--
--
--
CREATE TABLE Services (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE, -- optional
    Name text,
    Description text,
    Protocol text,
    DefaultPort text,
    StickyMechanism StickyMechanismType DEFAULT 'none',
    Distribution DistributionType DEFAULT 'anycast',
    AddressScope AddressScopeType DEFAULT 'van'
);

--
-- Mapping of services to the processes/ingresses that offer that service
--
CREATE TABLE ServiceAttaches (
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE, -- optional
    ImageTemplate UUID REFERENCES ImageTemplates,
    Service UUID REFERENCES Services,
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
    ImageTemplate UUID REFERENCES ImageTemplates,
    IngressHost text
);

--
-- Specific interconnect between running images and endpoints
--
CREATE TABLE ServiceLinks (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    Service UUID REFERENCES Services,
    VanAddress text,
    Distribution DistributionType DEFAULT 'anycast',
    Scope AddressScopeType DEFAULT 'van'
);

--
--
--
CREATE TABLE ServiceLinkAttaches (
    MemberOf     UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    Component    UUID REFERENCES Components          ON DELETE CASCADE,
    ServiceLink  UUID REFERENCES ServiceLinks        ON DELETE CASCADE,
    Role RoleType
);


--
-- Pre-populate the database with some test data.
--
INSERT INTO Users (Id, DisplayName, Email, PasswordHash) VALUES (1, 'Ted Ross', 'tross@redhat.com', '18f4e1168a37a7a2d5ac2bff043c12c862d515a2cbb9ab5fe207ab4ef235e129c1a475ffca25c4cb3831886158c3836664d489c98f68c0ac7af5a8f6d35e04fa');
INSERT INTO WebSessions (Id, UserId) values (gen_random_uuid(), 1);


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

*/

