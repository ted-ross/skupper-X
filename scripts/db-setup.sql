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
    UserId integer REFERENCES Users (Id),
    StartTime timestamp (0) with time zone,
    EndTime timestamp (0) with time zone
);

--
-- x.509 certificates and certificate authorities
--
CREATE TABLE TlsCertificates (
    Id UUID PRIMARY KEY,
    IsCertificateAuthority boolean,
    SecretName text,
    SignedBy UUID REFERENCES TlsCertificates (Id)
);

--
-- User-owned application networks
--
CREATE TABLE ApplicationNetworks (
    Id UUID PRIMARY KEY,
    Name text,
    Owner integer REFERENCES Users (Id),
    CertificateAuthority UUID REFERENCES TlsCertificates (Id),
    StartTime timestamp (0) with time zone,
    EndTime timestamp (0) with time zone,
    DeleteDelay interval second (0)
);

--
-- Sites that form the interior transit backbone
--
CREATE TABLE InteriorSites (
    Id integer PRIMARY KEY,
    InterRouterTlsCertificate UUID REFERENCES TlsCertificates (Id),
    EdgeTlsCertificate UUID REFERENCES TlsCertificates (Id)
);

--
-- Links that interconnect the interior transit backbone routers
--
CREATE TABLE InterRouterLink (
    ListeningInteriorSite integer REFERENCES InteriorSites (Id),
    ConnectingInteriorSite integer REFERENCES InteriorSites (Id)
);

--
-- VAN-specific site classes
--
CREATE TABLE SiteClasses (
    Id UUID PRIMARY KEY,
    Name text,
    MemberOf UUID REFERENCES ApplicationNetworks (Id),
    Description text
);

--
-- Content of an invitation-to-participate in a VAN
--
CREATE TABLE ParticipantInvitationTokens (
    Id UUID PRIMARY KEY,
    label text,
    StartTime timestamp (0) with time zone,
    EndTime timestamp (0) with time zone,
    ParticipantClass UUID REFERENCES SiteClasses (Id),
    MemberOf UUID REFERENCES ApplicationNetworks (Id),
    ClaimCertificate UUID REFERENCES TlsCertificates (Id),  -- Claim certificate
    InstanceLimit integer,
    InstanceCount integer
);

--
-- Mapping of participant sites to their backbone attach point(s)
--
CREATE TABLE EdgeLink (
    InteriorSite integer REFERENCES InteriorSites (Id),
    EdgeToken UUID REFERENCES ParticipantInvitationTokens (Id)
);

--
-- Attached participant sites (accepted invitations)
--
CREATE TABLE ParticipantSites (
    Id UUID PRIMARY KEY,
    OriginToken UUID REFERENCES ParticipantInvitationTokens (Id),
    Label text,
    SiteClass UUID REFERENCES SiteClasses (Id),
    ActiveAccessPoint integer REFERENCES InteriorSites (Id)
);

--
-- Available process images
--
CREATE TABLE Processes (
    Id UUID PRIMARY KEY,
    Name text,
    ImageName text,
    Description text
);

--
-- VAN-specific allocation of processes to participant sites or site classes
--
CREATE TABLE ProcessAllocations (
    MemberOf UUID REFERENCES ApplicationNetworks (Id),
    Process UUID REFERENCES Processes (Id),
    SiteClass UUID REFERENCES SiteClasses (Id),
    Site UUID REFERENCES ParticipantSites (Id),
    ImageTag text
);

--
-- Services offered and required by processes
--
CREATE TABLE Services (
    Id text PRIMARY KEY,
    MemberOf UUID REFERENCES ApplicationNetworks (Id),
    Protocol text,
    Port text,
    Description text
);

--
-- Mapping of services to the processes that offer that service
--
CREATE TABLE OfferedServices (
    MemberOf UUID REFERENCES ApplicationNetworks (Id),
    workload UUID REFERENCES Processes (Id),
    service text REFERENCES Services (Id)
);

--
-- Mapping of services to the processes that require that service
--
CREATE TABLE RequiredServices (
    MemberOf UUID REFERENCES ApplicationNetworks (Id),
    workload UUID REFERENCES Processes (Id),
    service text REFERENCES Services (Id)
);

INSERT INTO Users (Id, DisplayName, Email, PasswordHash) VALUES (1, 'Ted Ross', 'tross@redhat.com', '18f4e1168a37a7a2d5ac2bff043c12c862d515a2cbb9ab5fe207ab4ef235e129c1a475ffca25c4cb3831886158c3836664d489c98f68c0ac7af5a8f6d35e04fa');

INSERT INTO WebSessions (id, userid, starttime) values (gen_random_uuid(), 1, CURRENT_TIMESTAMP);


