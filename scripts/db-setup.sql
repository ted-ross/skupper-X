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
    IsCertificateAuthority boolean,
    SecretName text,
    SignedBy UUID REFERENCES TlsCertificates,
    Expiration timestamp (0) with time zone
);

--
-- Sites that form the interior transit backbone
--
CREATE TABLE InteriorSites (
    Id text PRIMARY KEY,
    InterRouterTlsCertificate UUID REFERENCES TlsCertificates,
    EdgeTlsCertificate UUID REFERENCES TlsCertificates
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
-- Available process images
--
CREATE TABLE Images (
    Id UUID PRIMARY KEY,
    Name text,
    ImageName text,
    Description text
);

--
-- Services offered and required by processes
--
CREATE TABLE Services (
    Id text PRIMARY KEY,
    Protocol text,
    DefaultPort text,
    Description text
);

--
-- Mapping of services to the processes/ingresses that offer that service
--
CREATE TABLE OfferedServices (
    Image UUID REFERENCES Images,
    Service text REFERENCES Services,
    ActualPort text,
    stickyMechanism StickyMechanismType DEFAULT 'none'
);

--
-- Mapping of services to the processes/egresses that require that service
--
CREATE TABLE RequiredServices (
    Image UUID REFERENCES Images,
    Service text REFERENCES Services
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
-- Specific interconnect between running images and endpoints
--
CREATE TABLE ServiceLinks (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE,
    Service text REFERENCES Services,
    VanAddress text,
    Distribution DistributionType DEFAULT 'anycast',
    Scope AddressScopeType DEFAULT 'van'
);

--
-- Parent entity for all endpoint types
--
CREATE TABLE Endpoints (
    Id UUID PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks ON DELETE CASCADE
);

--
-- VAN-specific allocation of processes to participant sites or site classes
--
CREATE TABLE ImageAllocations (
    Process UUID REFERENCES Images,
    SiteClass UUID REFERENCES SiteClasses,
    Site UUID REFERENCES MemberSites,
    ImageTag text DEFAULT 'latest'
) INHERITS (Endpoints);

--
-- Stand-alone ingresses and their mapping to sites/site-classes
--
CREATE TABLE Ingresses (
    Name text,
    SiteClass UUID REFERENCES SiteClasses,
    Site UUID REFERENCES MemberSites
) INHERITS (Endpoints);

--
-- Stand-alone egresses and their mapping to sites/site-classes
--
CREATE TABLE Egresses (
    Name text,
    SiteClass UUID REFERENCES SiteClasses,
    Site UUID REFERENCES MemberSites
) INHERITS (Endpoints);


INSERT INTO Users (Id, DisplayName, Email, PasswordHash) VALUES (1, 'Ted Ross', 'tross@redhat.com', '18f4e1168a37a7a2d5ac2bff043c12c862d515a2cbb9ab5fe207ab4ef235e129c1a475ffca25c4cb3831886158c3836664d489c98f68c0ac7af5a8f6d35e04fa');

INSERT INTO WebSessions (id, userid) values (gen_random_uuid(), 1);


/*
Notes:

  - Consider a "service-link" type that represents a service-specific relationship between a specified set of processes or [in,e]gresses.
      o Ties "required" services to "provided" services
      o Owns the VAN address for the service-link, including scope-specific sub-addresses
      o Specifies the distribution of payload: anycast, multicast

  - (DONE) Consider using inheritance to group processes and [in,e]gresses.

*/

