-- Mock data script for Skupper-X PostgreSQL database (working version)

-- Disable foreign key constraints temporarily for data cleanup
SET session_replication_role = replica;

-- Clean existing data using correct table names
TRUNCATE TABLE deployedapplications CASCADE;
TRUNCATE TABLE bindings CASCADE;
TRUNCATE TABLE instanceblocks CASCADE;
TRUNCATE TABLE applications CASCADE;
TRUNCATE TABLE libraryblocks CASCADE;
TRUNCATE TABLE interfaceroles CASCADE;
TRUNCATE TABLE blocktypes CASCADE;
TRUNCATE TABLE memberinvitations CASCADE;
TRUNCATE TABLE membersites CASCADE;
TRUNCATE TABLE applicationnetworks CASCADE;
TRUNCATE TABLE interrouterlinks CASCADE;
TRUNCATE TABLE backboneaccesspoints CASCADE;
TRUNCATE TABLE interiorsites CASCADE;
TRUNCATE TABLE backbones CASCADE;
TRUNCATE TABLE managementcontrollers CASCADE;
TRUNCATE TABLE tlscertificates CASCADE;

-- Re-enable foreign key constraints
SET session_replication_role = DEFAULT;

-- Create temporary table to store UUIDs
CREATE TEMP TABLE temp_ids (
    table_name TEXT,
    name TEXT,
    id UUID
);

-- Insert TLS Certificates
INSERT INTO tlscertificates (id, isca, objectname, expiration, renewaltime, rotationordinal) VALUES
-- Active certificates
(gen_random_uuid(), false, 'production-cert-1', CURRENT_TIMESTAMP + INTERVAL '6 months', CURRENT_TIMESTAMP + INTERVAL '1 month', 1),
(gen_random_uuid(), false, 'staging-cert-1', CURRENT_TIMESTAMP + INTERVAL '1 year', CURRENT_TIMESTAMP + INTERVAL '3 months', 1),
-- Soon to expire certificates
(gen_random_uuid(), false, 'development-cert-1', CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP - INTERVAL '1 day', 1),
-- Expired certificates
(gen_random_uuid(), false, 'test-cert-1', CURRENT_TIMESTAMP - INTERVAL '30 days', CURRENT_TIMESTAMP - INTERVAL '60 days', 1),
-- CA certificates
(gen_random_uuid(), true, 'root-ca-1', CURRENT_TIMESTAMP + INTERVAL '8 months', CURRENT_TIMESTAMP + INTERVAL '2 months', 1),
(gen_random_uuid(), true, 'intermediate-ca-1', CURRENT_TIMESTAMP + INTERVAL '15 days', CURRENT_TIMESTAMP - INTERVAL '5 days', 1);

-- Store certificate IDs
INSERT INTO temp_ids (table_name, name, id)
SELECT 'certificates', objectname, id FROM tlscertificates;

-- Insert Backbones
INSERT INTO backbones (id, name, multitenant, lifecycle, failure, certificate) VALUES
(gen_random_uuid(), 'production-backbone', true, 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1')),
(gen_random_uuid(), 'staging-backbone', false, 'active', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1')),
(gen_random_uuid(), 'development-backbone', true, 'partial', NULL, (SELECT id FROM temp_ids WHERE name = 'development-cert-1')),
(gen_random_uuid(), 'test-backbone', false, 'failed', 'Certificate validation failed', (SELECT id FROM temp_ids WHERE name = 'test-cert-1')),
(gen_random_uuid(), 'legacy-backbone', true, 'failed', 'Network connectivity issues', NULL);

-- Store backbone IDs
INSERT INTO temp_ids (table_name, name, id)
SELECT 'backbones', name, id FROM backbones;

-- Insert Interior Sites
INSERT INTO interiorsites (id, name, lifecycle, failure, certificate, deploymentstate, targetplatform, metadata, firstactivetime, lastheartbeat, backbone) VALUES
-- Ready sites
(gen_random_uuid(), 'kubernetes-site-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), 'deployed', 'kube', '{"region": "us-east-1", "zone": "a"}', CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP - INTERVAL '1 hour', (SELECT id FROM temp_ids WHERE name = 'production-backbone')),
(gen_random_uuid(), 'podman-site-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), 'deployed', 'podman-sk2', '{"region": "us-west-2", "zone": "b"}', CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '30 minutes', (SELECT id FROM temp_ids WHERE name = 'production-backbone')),
(gen_random_uuid(), 'docker-site-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'development-cert-1'), 'deployed', 'docker-sk2', '{"region": "eu-west-1", "zone": "a"}', CURRENT_TIMESTAMP - INTERVAL '7 days', CURRENT_TIMESTAMP - INTERVAL '2 hours', (SELECT id FROM temp_ids WHERE name = 'staging-backbone')),

-- Active sites
(gen_random_uuid(), 'openshift-site-1', 'active', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), 'deployed', 'kube', '{"region": "ap-south-1", "zone": "c"}', CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP - INTERVAL '15 minutes', (SELECT id FROM temp_ids WHERE name = 'staging-backbone')),
(gen_random_uuid(), 'systemd-site-1', 'active', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), 'deployed', 'linux-sk2', '{"region": "eu-central-1", "zone": "b"}', CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '45 minutes', (SELECT id FROM temp_ids WHERE name = 'production-backbone')),

-- Partial sites
(gen_random_uuid(), 'kubernetes-site-2', 'partial', NULL, NULL, 'not-ready', 'kube', '{"region": "us-east-2", "zone": "a"}', NULL, NULL, (SELECT id FROM temp_ids WHERE name = 'development-backbone')),
(gen_random_uuid(), 'podman-site-2', 'partial', NULL, NULL, 'not-ready', 'podman-sk2', '{"region": "ca-central-1", "zone": "a"}', NULL, NULL, (SELECT id FROM temp_ids WHERE name = 'development-backbone')),

-- Failed sites
(gen_random_uuid(), 'docker-site-2', 'failed', 'Deployment timeout', NULL, 'not-ready', 'docker-sk2', '{"region": "ap-northeast-1", "zone": "b"}', NULL, CURRENT_TIMESTAMP - INTERVAL '6 hours', (SELECT id FROM temp_ids WHERE name = 'test-backbone')),
(gen_random_uuid(), 'kubernetes-site-3', 'failed', 'Insufficient resources', (SELECT id FROM temp_ids WHERE name = 'development-cert-1'), 'not-ready', 'kube', '{"region": "us-west-1", "zone": "c"}', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '4 hours', (SELECT id FROM temp_ids WHERE name = 'test-backbone')),

-- Certificate issue sites
(gen_random_uuid(), 'cert-expiring-site', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'intermediate-ca-1'), 'deployed', 'podman-sk2', '{"region": "sa-east-1", "zone": "a"}', CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '20 minutes', (SELECT id FROM temp_ids WHERE name = 'production-backbone')),
(gen_random_uuid(), 'cert-expired-site', 'failed', 'TLS certificate expired', (SELECT id FROM temp_ids WHERE name = 'test-cert-1'), 'deployed', 'docker-sk2', '{"region": "af-south-1", "zone": "a"}', CURRENT_TIMESTAMP - INTERVAL '35 days', CURRENT_TIMESTAMP - INTERVAL '1 day', (SELECT id FROM temp_ids WHERE name = 'legacy-backbone'));

-- Store site IDs
INSERT INTO temp_ids (table_name, name, id)
SELECT 'sites', name, id FROM interiorsites;

-- Insert Backbone Access Points
INSERT INTO backboneaccesspoints (id, name, lifecycle, failure, certificate, hostname, port, kind, bindhost, interiorsite) VALUES
-- Claim access points
(gen_random_uuid(), 'k8s-claim-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), 'site1.example.com', '8080', 'claim', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'kubernetes-site-1')),
(gen_random_uuid(), 'podman-claim-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), 'site2.example.com', '8080', 'claim', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'podman-site-1')),
(gen_random_uuid(), 'docker-claim-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'development-cert-1'), 'site3.example.com', '8080', 'claim', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'docker-site-1')),
(gen_random_uuid(), 'openshift-claim-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), 'site4.example.com', '8080', 'claim', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'openshift-site-1')),

-- Member access points
(gen_random_uuid(), 'k8s-member-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), 'site1-member.example.com', '8081', 'member', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'kubernetes-site-1')),
(gen_random_uuid(), 'podman-member-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), 'site2-member.example.com', '8081', 'member', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'podman-site-1')),
(gen_random_uuid(), 'docker-member-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'development-cert-1'), 'site3-member.example.com', '8081', 'member', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'docker-site-1')),
(gen_random_uuid(), 'openshift-member-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), 'site4-member.example.com', '8081', 'member', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'openshift-site-1')),

-- Peer access points
(gen_random_uuid(), 'k8s-peer-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), 'site1-peer.example.com', '5671', 'peer', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'kubernetes-site-1')),
(gen_random_uuid(), 'podman-peer-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), 'site2-peer.example.com', '5671', 'peer', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'podman-site-1')),
(gen_random_uuid(), 'docker-peer-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'development-cert-1'), 'site3-peer.example.com', '5671', 'peer', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'docker-site-1')),
(gen_random_uuid(), 'systemd-peer-ap-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), 'site5-peer.example.com', '5671', 'peer', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'systemd-site-1')),

-- Partial access points
(gen_random_uuid(), 'k8s-claim-ap-2', 'partial', NULL, NULL, NULL, NULL, 'claim', NULL, (SELECT id FROM temp_ids WHERE name = 'kubernetes-site-2')),
(gen_random_uuid(), 'podman-member-ap-2', 'partial', NULL, NULL, NULL, NULL, 'member', NULL, (SELECT id FROM temp_ids WHERE name = 'podman-site-2')),

-- Failed access points
(gen_random_uuid(), 'docker-claim-ap-2', 'failed', 'Port binding failed', NULL, NULL, '8080', 'claim', NULL, (SELECT id FROM temp_ids WHERE name = 'docker-site-2')),
(gen_random_uuid(), 'k8s-peer-ap-2', 'failed', 'LoadBalancer creation failed', NULL, NULL, '5671', 'peer', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'kubernetes-site-3')),

-- Active access points
(gen_random_uuid(), 'systemd-claim-ap-1', 'active', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), 'site5.example.com', '8080', 'claim', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'systemd-site-1')),
(gen_random_uuid(), 'systemd-member-ap-1', 'active', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), 'site5-member.example.com', '8081', 'member', '0.0.0.0', (SELECT id FROM temp_ids WHERE name = 'systemd-site-1'));

-- Store access point IDs
INSERT INTO temp_ids (table_name, name, id)
SELECT 'accesspoints', name, id FROM backboneaccesspoints;

-- Insert Inter-Router Links
INSERT INTO interrouterlinks (id, accesspoint, connectinginteriorsite, cost) VALUES
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'k8s-peer-ap-1'), (SELECT id FROM temp_ids WHERE name = 'podman-site-1'), 1),
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'podman-peer-ap-1'), (SELECT id FROM temp_ids WHERE name = 'docker-site-1'), 1),
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'docker-peer-ap-1'), (SELECT id FROM temp_ids WHERE name = 'kubernetes-site-1'), 1),
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'systemd-peer-ap-1'), (SELECT id FROM temp_ids WHERE name = 'kubernetes-site-1'), 10),
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'k8s-peer-ap-1'), (SELECT id FROM temp_ids WHERE name = 'systemd-site-1'), 5);

-- Insert Application Networks (VANs)
INSERT INTO applicationnetworks (id, name, backbone, lifecycle, failure, starttime, endtime, deletedelay, certificate, vanid) VALUES
(gen_random_uuid(), 'production-van', (SELECT id FROM temp_ids WHERE name = 'production-backbone'), 'ready', NULL, CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP + INTERVAL '30 days', INTERVAL '5 minutes', (SELECT id FROM temp_ids WHERE name = 'root-ca-1'), 'prod-van-001'),
(gen_random_uuid(), 'staging-van', (SELECT id FROM temp_ids WHERE name = 'staging-backbone'), 'active', NULL, CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP + INTERVAL '15 days', INTERVAL '5 minutes', (SELECT id FROM temp_ids WHERE name = 'intermediate-ca-1'), 'stage-van-001'),
(gen_random_uuid(), 'development-van', (SELECT id FROM temp_ids WHERE name = 'production-backbone'), 'ready', NULL, CURRENT_TIMESTAMP - INTERVAL '3 days', NULL, INTERVAL '10 minutes', (SELECT id FROM temp_ids WHERE name = 'root-ca-1'), 'dev-van-001'),
(gen_random_uuid(), 'test-van', (SELECT id FROM temp_ids WHERE name = 'staging-backbone'), 'ready', NULL, CURRENT_TIMESTAMP - INTERVAL '20 days', CURRENT_TIMESTAMP - INTERVAL '1 day', INTERVAL '5 minutes', NULL, 'test-van-001'),
(gen_random_uuid(), 'failed-van', (SELECT id FROM temp_ids WHERE name = 'test-backbone'), 'failed', 'Backbone connectivity lost', CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP + INTERVAL '10 days', INTERVAL '5 minutes', NULL, 'failed-van-001'),
(gen_random_uuid(), 'partial-van', (SELECT id FROM temp_ids WHERE name = 'development-backbone'), 'partial', NULL, CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP + INTERVAL '7 days', INTERVAL '5 minutes', NULL, 'partial-van-001');

-- Store VAN IDs
INSERT INTO temp_ids (table_name, name, id)
SELECT 'vans', name, id FROM applicationnetworks;

-- Insert Member Sites (VAN memberships)
INSERT INTO membersites (id, name, lifecycle, failure, certificate, firstactivetime, lastheartbeat, memberof, metadata, siteclasses) VALUES
-- Production VAN members
(gen_random_uuid(), 'prod-member-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), CURRENT_TIMESTAMP - INTERVAL '5 days', CURRENT_TIMESTAMP - INTERVAL '1 hour', (SELECT id FROM temp_ids WHERE name = 'production-van'), '{"region": "us-east-1"}', ARRAY['worker', 'storage']),
(gen_random_uuid(), 'prod-member-2', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), CURRENT_TIMESTAMP - INTERVAL '3 days', CURRENT_TIMESTAMP - INTERVAL '30 minutes', (SELECT id FROM temp_ids WHERE name = 'production-van'), '{"region": "us-west-2"}', ARRAY['worker']),

-- Staging VAN members
(gen_random_uuid(), 'stage-member-1', 'active', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), CURRENT_TIMESTAMP - INTERVAL '10 days', CURRENT_TIMESTAMP - INTERVAL '15 minutes', (SELECT id FROM temp_ids WHERE name = 'staging-van'), '{"region": "ap-south-1"}', ARRAY['worker', 'database']),
(gen_random_uuid(), 'stage-member-2', 'active', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), CURRENT_TIMESTAMP - INTERVAL '2 days', CURRENT_TIMESTAMP - INTERVAL '45 minutes', (SELECT id FROM temp_ids WHERE name = 'staging-van'), '{"region": "eu-central-1"}', ARRAY['worker']),

-- Development VAN members
(gen_random_uuid(), 'dev-member-1', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '20 minutes', (SELECT id FROM temp_ids WHERE name = 'development-van'), '{"region": "sa-east-1"}', ARRAY['worker', 'monitor']),

-- Failed member
(gen_random_uuid(), 'failed-member-1', 'failed', 'Connection timeout', (SELECT id FROM temp_ids WHERE name = 'test-cert-1'), CURRENT_TIMESTAMP - INTERVAL '35 days', CURRENT_TIMESTAMP - INTERVAL '1 day', (SELECT id FROM temp_ids WHERE name = 'failed-van'), '{"region": "af-south-1"}', ARRAY['worker']);

-- Insert Member Invitations
INSERT INTO memberinvitations (id, name, lifecycle, failure, certificate, claimaccess, joindeadline, memberclasses, memberof, instancelimit, instancecount, fetchcount, interactiveclaim, membernameprefix) VALUES
-- Ready invitations
(gen_random_uuid(), 'prod-k8s-invitation', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), (SELECT id FROM temp_ids WHERE name = 'k8s-claim-ap-1'), CURRENT_TIMESTAMP + INTERVAL '7 days', ARRAY['worker', 'storage'], (SELECT id FROM temp_ids WHERE name = 'production-van'), 5, 0, 0, true, 'prod-k8s'),
(gen_random_uuid(), 'staging-podman-invitation', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), (SELECT id FROM temp_ids WHERE name = 'openshift-claim-ap-1'), CURRENT_TIMESTAMP + INTERVAL '3 days', ARRAY['worker'], (SELECT id FROM temp_ids WHERE name = 'staging-van'), 3, 1, 2, false, 'stage-podman'),

-- Active invitations
(gen_random_uuid(), 'dev-docker-invitation', 'active', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), (SELECT id FROM temp_ids WHERE name = 'k8s-claim-ap-1'), CURRENT_TIMESTAMP + INTERVAL '14 days', ARRAY['worker', 'database'], (SELECT id FROM temp_ids WHERE name = 'development-van'), 10, 3, 5, true, 'dev-docker'),

-- Expired invitations
(gen_random_uuid(), 'expired-invitation', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'staging-cert-1'), (SELECT id FROM temp_ids WHERE name = 'podman-claim-ap-1'), CURRENT_TIMESTAMP - INTERVAL '1 day', ARRAY['worker'], (SELECT id FROM temp_ids WHERE name = 'production-van'), 2, 0, 0, false, 'expired'),

-- Failed invitations
(gen_random_uuid(), 'failed-invitation', 'failed', 'Access point not available', NULL, (SELECT id FROM temp_ids WHERE name = 'docker-claim-ap-2'), CURRENT_TIMESTAMP + INTERVAL '5 days', ARRAY['worker'], (SELECT id FROM temp_ids WHERE name = 'failed-van'), 1, 0, 0, true, 'failed'),

-- Unlimited invitation
(gen_random_uuid(), 'unlimited-invitation', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'development-cert-1'), (SELECT id FROM temp_ids WHERE name = 'docker-claim-ap-1'), CURRENT_TIMESTAMP + INTERVAL '30 days', ARRAY['worker', 'monitor'], (SELECT id FROM temp_ids WHERE name = 'development-van'), NULL, 2, 3, true, 'unlimited'),

-- High usage invitation
(gen_random_uuid(), 'high-usage-invitation', 'ready', NULL, (SELECT id FROM temp_ids WHERE name = 'production-cert-1'), (SELECT id FROM temp_ids WHERE name = 'k8s-claim-ap-1'), CURRENT_TIMESTAMP + INTERVAL '10 days', ARRAY['worker'], (SELECT id FROM temp_ids WHERE name = 'production-van'), 5, 4, 8, false, 'high-usage');

-- Insert comprehensive interface roles
INSERT INTO InterfaceRoles (Name) VALUES
    ('accept'), ('connect'),
    ('send'), ('receive'), 
    ('produce'), ('consume'),
    ('request'), ('respond'),
    ('mount'),
    ('tcp-server'), ('tcp-client'),
    ('http-server'), ('http-client'),
    ('database-server'), ('database-client'),
    ('message-producer'), ('message-consumer'),
    ('api-provider'), ('api-consumer'),
    ('storage-provider'), ('storage-consumer'),
    ('metrics-provider'), ('metrics-consumer'),
    ('log-producer'), ('log-consumer'),
    ('file-server'), ('file-client');

-- Insert comprehensive block types for application components
INSERT INTO BlockTypes (Name, AllowNorth, AllowSouth, AllocateToSite) VALUES
    ('web-service', true, false, true),
    ('api-gateway', true, false, true),
    ('database', false, true, true),
    ('message-queue', true, true, true),
    ('cache', true, true, true),
    ('load-balancer', true, false, true),
    ('skupperx.io/component', true, false, true),
    ('skupperx.io/connector', false, true, false),
    ('skupperx.io/toplevel', false, false, false),
    ('skupperx.io/mixed', true, true, false),
    ('skupperx.io/ingress', true, false, true),
    ('skupperx.io/egress', false, true, false),
    ('skupperx.io/container', true, true, true),
    ('microservice', true, true, true),
    ('auth-server', true, false, true),
    ('monitoring', false, true, true),
    ('storage', false, true, true),
    ('compute', true, true, true);

-- Insert sample library blocks with proper configuration format
INSERT INTO LibraryBlocks (Id, Type, Name, Provider, BodyStyle, Revision, Config, Interfaces, SpecBody, Created) VALUES
-- Basic component blocks
-- Web service block
(gen_random_uuid(), 'web-service', 'nginx-frontend', 'nginx.com', 'simple', 1, '{
  "image": {
    "type": "string",
    "description": "Docker image for nginx web server",
    "default": "nginx:latest"
  },
  "port": {
    "type": "numeric", 
    "description": "HTTP port for the web server",
    "default": 80
  },
  "replicas": {
    "type": "numeric",
    "description": "Number of replicas",
    "default": 1
  }
}', '{
  "frontend": {
    "role": "http-server",
    "polarity": "north",
    "maxBindings": "unlimited",
    "data": {"port": 80, "protocol": "http"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  kubeTemplates:
    - selector:
        siteClass: worker
      template:
        - apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: nginx-frontend
          spec:
            replicas: ${replicas}
            selector:
              matchLabels:
                app: nginx-frontend
            template:
              metadata:
                labels:
                  app: nginx-frontend
              spec:
                containers:
                - name: nginx
                  image: ${image}
                  ports:
                  - containerPort: ${port}', CURRENT_TIMESTAMP),

-- API Gateway block  
(gen_random_uuid(), 'api-gateway', 'kong-gateway', 'kong.com', 'simple', 2, '{
  "image": {
    "type": "string",
    "description": "Docker image for Kong API gateway",
    "default": "kong:latest"
  },
  "admin_port": {
    "type": "numeric",
    "description": "Kong admin API port", 
    "default": 8001
  },
  "proxy_port": {
    "type": "numeric",
    "description": "Kong proxy port",
    "default": 8000
  }
}', '{
  "api": {
    "role": "api-provider",
    "polarity": "north", 
    "maxBindings": "unlimited",
    "data": {"port": 8000, "protocol": "http"}
  },
  "admin": {
    "role": "http-server",
    "polarity": "north",
    "maxBindings": 1,
    "data": {"port": 8001, "protocol": "http"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  kubeTemplates:
    - selector:
        siteClass: worker
      template:
        - apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: kong-gateway
          spec:
            replicas: 1
            selector:
              matchLabels:
                app: kong-gateway
            template:
              metadata:
                labels:
                  app: kong-gateway
              spec:
                containers:
                - name: kong
                  image: ${image}
                  ports:
                  - containerPort: ${admin_port}
                  - containerPort: ${proxy_port}', CURRENT_TIMESTAMP),

-- Database block
(gen_random_uuid(), 'database', 'postgresql-db', 'postgresql.org', 'simple', 1, '{
  "image": {
    "type": "string",
    "description": "Docker image for PostgreSQL database",
    "default": "postgres:15"
  },
  "port": {
    "type": "numeric",
    "description": "PostgreSQL server port",
    "default": 5432
  },
  "database": {
    "type": "string",
    "description": "Database name",
    "default": "appdb"
  }
}', '{
  "database": {
    "role": "database-server",
    "polarity": "south",
    "maxBindings": "unlimited",
    "data": {"port": 5432, "protocol": "tcp", "database": "appdb"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  kubeTemplates:
    - selector:
        siteClass: database
      template:
        - apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: postgresql-db
          spec:
            replicas: 1
            selector:
              matchLabels:
                app: postgresql-db
            template:
              metadata:
                labels:
                  app: postgresql-db
              spec:
                containers:
                - name: postgres
                  image: ${image}
                  ports:
                  - containerPort: ${port}
                  env:
                  - name: POSTGRES_DB
                    value: ${database}', CURRENT_TIMESTAMP),

-- Message Queue block
(gen_random_uuid(), 'message-queue', 'redis-queue', 'redis.io', 'simple', 1, '{
  "image": {
    "type": "string",
    "description": "Docker image for Redis message queue",
    "default": "redis:7"
  },
  "port": {
    "type": "numeric",
    "description": "Redis server port",
    "default": 6379
  }
}', '{
  "producer": {
    "role": "message-producer",
    "polarity": "south",
    "maxBindings": "unlimited",
    "data": {"port": 6379, "protocol": "tcp"}
  },
  "consumer": {
    "role": "message-consumer", 
    "polarity": "south",
    "maxBindings": "unlimited",
    "data": {"port": 6379, "protocol": "tcp"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  kubeTemplates:
    - selector:
        siteClass: worker
      template:
        - apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: redis-queue
          spec:
            replicas: 1
            selector:
              matchLabels:
                app: redis-queue
            template:
              metadata:
                labels:
                  app: redis-queue
              spec:
                containers:
                - name: redis
                  image: ${image}
                  ports:
                  - containerPort: ${port}', CURRENT_TIMESTAMP),

-- Cache block
(gen_random_uuid(), 'cache', 'memcached', 'memcached.org', 'simple', 3, '{
  "image": {
    "type": "string",
    "description": "Docker image for Memcached cache server",
    "default": "memcached:latest"
  },
  "port": {
    "type": "numeric",
    "description": "Memcached server port",
    "default": 11211
  }
}', '{
  "cache": {
    "role": "storage-provider",
    "polarity": "south",
    "maxBindings": "unlimited",
    "data": {"port": 11211, "protocol": "tcp"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  kubeTemplates:
    - selector:
        siteClass: worker
      template:
        - apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: memcached
          spec:
            replicas: 1
            selector:
              matchLabels:
                app: memcached
            template:
              metadata:
                labels:
                  app: memcached
              spec:
                containers:
                - name: memcached
                  image: ${image}
                  ports:
                  - containerPort: ${port}', CURRENT_TIMESTAMP),

-- Load Balancer block
(gen_random_uuid(), 'load-balancer', 'haproxy-lb', 'haproxy.org', 'simple', 1, '{
  "image": {
    "type": "string",
    "description": "Docker image for HAProxy load balancer",
    "default": "haproxy:2.8"
  },
  "frontend_port": {
    "type": "numeric",
    "description": "Frontend port for load balancer",
    "default": 80
  },
  "stats_port": {
    "type": "numeric",
    "description": "Statistics port",
    "default": 8404
  }
}', '{
  "frontend": {
    "role": "http-server",
    "polarity": "north",
    "maxBindings": "unlimited",
    "data": {"port": 80, "protocol": "http"}
  },
  "backend": {
    "role": "http-client",
    "polarity": "south",
    "maxBindings": "unlimited",
    "data": {"protocol": "http"}
  },
  "stats": {
    "role": "http-server",
    "polarity": "north",
    "maxBindings": 1,
    "data": {"port": 8404, "protocol": "http"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  kubeTemplates:
    - selector:
        siteClass: worker
      template:
        - apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: haproxy-lb
          spec:
            replicas: 1
            selector:
              matchLabels:
                app: haproxy-lb
            template:
              metadata:
                labels:
                  app: haproxy-lb
              spec:
                containers:
                - name: haproxy
                  image: ${image}
                  ports:
                  - containerPort: ${frontend_port}
                  - containerPort: ${stats_port}', CURRENT_TIMESTAMP),

-- Authentication Server block
(gen_random_uuid(), 'auth-server', 'keycloak-auth', 'keycloak.org', 'simple', 1, '{
  "image": {
    "type": "string",
    "description": "Docker image for Keycloak authentication server",
    "default": "quay.io/keycloak/keycloak:22.0"
  },
  "port": {
    "type": "numeric",
    "description": "Keycloak server port",
    "default": 8080
  },
  "admin_port": {
    "type": "numeric",
    "description": "Keycloak admin port",
    "default": 9990
  }
}', '{
  "auth": {
    "role": "api-provider",
    "polarity": "north",
    "maxBindings": "unlimited",
    "data": {"port": 8080, "protocol": "http", "service": "authentication"}
  },
  "admin": {
    "role": "http-server",
    "polarity": "north",
    "maxBindings": 1,
    "data": {"port": 9990, "protocol": "http"}
  },
  "database": {
    "role": "database-client",
    "polarity": "south",
    "maxBindings": 1,
    "data": {"protocol": "tcp"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  kubeTemplates:
    - selector:
        siteClass: worker
      template:
        - apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: keycloak-auth
          spec:
            replicas: 1
            selector:
              matchLabels:
                app: keycloak-auth
            template:
              metadata:
                labels:
                  app: keycloak-auth
              spec:
                containers:
                - name: keycloak
                  image: ${image}
                  ports:
                  - containerPort: ${port}
                  - containerPort: ${admin_port}', CURRENT_TIMESTAMP),

-- Monitoring Server block  
(gen_random_uuid(), 'monitoring', 'prometheus', 'prometheus.io', 'simple', 1, '{
  "image": {
    "type": "string",
    "description": "Docker image for Prometheus monitoring",
    "default": "prom/prometheus:v2.44.0"
  },
  "port": {
    "type": "numeric",
    "description": "Prometheus server port",
    "default": 9090
  }
}', '{
  "metrics": {
    "role": "metrics-consumer",
    "polarity": "south",
    "maxBindings": "unlimited",
    "data": {"protocol": "http"}
  },
  "web": {
    "role": "http-server",
    "polarity": "north",
    "maxBindings": "unlimited",
    "data": {"port": 9090, "protocol": "http"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  kubeTemplates:
    - selector:
        siteClass: worker
      template:
        - apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: prometheus
          spec:
            replicas: 1
            selector:
              matchLabels:
                app: prometheus
            template:
              metadata:
                labels:
                  app: prometheus
              spec:
                containers:
                - name: prometheus
                  image: ${image}
                  ports:
                  - containerPort: ${port}', CURRENT_TIMESTAMP),

-- Microservice Application block
(gen_random_uuid(), 'microservice', 'user-service', 'example.com', 'simple', 1, '{
  "image": {
    "type": "string",
    "description": "Docker image for user microservice",
    "default": "example.com/user-service:v1.0"
  },
  "port": {
    "type": "numeric",
    "description": "Service port",
    "default": 8080
  },
  "replicas": {
    "type": "numeric",
    "description": "Number of replicas",
    "default": 2
  }
}', '{
  "api": {
    "role": "api-provider",
    "polarity": "north",
    "maxBindings": "unlimited",
    "data": {"port": 8080, "protocol": "http", "service": "user-management"}
  },
  "database": {
    "role": "database-client",
    "polarity": "south",
    "maxBindings": 1,
    "data": {"protocol": "tcp"}
  },
  "cache": {
    "role": "storage-consumer",
    "polarity": "south",
    "maxBindings": 1,
    "data": {"protocol": "tcp"}
  },
  "metrics": {
    "role": "metrics-provider",
    "polarity": "north",
    "maxBindings": 1,
    "data": {"port": 9090, "protocol": "http"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  kubeTemplates:
    - selector:
        siteClass: worker
      template:
        - apiVersion: apps/v1
          kind: Deployment
          metadata:
            name: user-service
          spec:
            replicas: ${replicas}
            selector:
              matchLabels:
                app: user-service
            template:
              metadata:
                labels:
                  app: user-service
              spec:
                containers:
                - name: user-service
                  image: ${image}
                  ports:
                  - containerPort: ${port}
                  - containerPort: 9090', CURRENT_TIMESTAMP),

-- COMPOSITE TOP-LEVEL BLOCKS (Complex applications built from components)

-- E-Commerce Application (composite)
(gen_random_uuid(), 'skupperx.io/toplevel', 'ecommerce-app', 'example.com', 'composite', 1, '{
  "app_name": {
    "type": "string",
    "description": "Application name",
    "default": "ecommerce"
  },
  "frontend_replicas": {
    "type": "numeric",
    "description": "Frontend replicas",
    "default": 2
  },
  "backend_replicas": {
    "type": "numeric", 
    "description": "Backend replicas",
    "default": 3
  }
}', '{
  "frontend": {
    "role": "http-server",
    "polarity": "north",
    "maxBindings": "unlimited",
    "data": {"port": 80, "protocol": "http", "service": "web-frontend"}
  },
  "api": {
    "role": "api-provider",
    "polarity": "north",
    "maxBindings": "unlimited", 
    "data": {"port": 8080, "protocol": "http", "service": "api-gateway"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  components:
    frontend:
      block: nginx-frontend
      config:
        replicas: ${frontend_replicas}
    gateway:
      block: kong-gateway
    userservice:
      block: user-service
      config:
        replicas: ${backend_replicas}
    database: 
      block: postgresql-db
      config:
        database: ${app_name}_db
    cache:
      block: memcached
    loadbalancer:
      block: haproxy-lb
  bindings:
    - north: loadbalancer.frontend
      south: frontend.frontend
    - north: loadbalancer.backend
      south: gateway.api
    - north: gateway.admin
      south: userservice.api
    - north: userservice.database
      south: database.database
    - north: userservice.cache
      south: cache.cache', CURRENT_TIMESTAMP),

-- Monitoring Stack (composite)
(gen_random_uuid(), 'skupperx.io/toplevel', 'monitoring-stack', 'observability.io', 'composite', 1, '{
  "retention_days": {
    "type": "numeric",
    "description": "Metrics retention in days",
    "default": 15
  },
  "scrape_interval": {
    "type": "string",
    "description": "Metrics scrape interval",
    "default": "30s"
  }
}', '{
  "metrics": {
    "role": "http-server",
    "polarity": "north",
    "maxBindings": "unlimited",
    "data": {"port": 9090, "protocol": "http", "service": "monitoring"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  components:
    prometheus:
      block: prometheus
      config:
        retention: ${retention_days}d
        scrape_interval: ${scrape_interval}
    database:
      block: postgresql-db
      config:
        database: metrics_db
  bindings:
    - north: prometheus.metrics
      south: database.database', CURRENT_TIMESTAMP),

-- Authentication Platform (composite)
(gen_random_uuid(), 'skupperx.io/toplevel', 'auth-platform', 'security.com', 'composite', 1, '{
  "realm": {
    "type": "string",
    "description": "Authentication realm",
    "default": "master"
  },
  "theme": {
    "type": "string",
    "description": "Keycloak theme",
    "default": "keycloak"
  }
}', '{
  "auth": {
    "role": "api-provider",
    "polarity": "north",
    "maxBindings": "unlimited",
    "data": {"port": 8080, "protocol": "http", "service": "authentication"}
  },
  "admin": {
    "role": "http-server",
    "polarity": "north", 
    "maxBindings": 1,
    "data": {"port": 9990, "protocol": "http"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  components:
    keycloak:
      block: keycloak-auth
      config:
        realm: ${realm}
        theme: ${theme}
    database:
      block: postgresql-db
      config:
        database: keycloak_db
    cache:
      block: redis-queue
  bindings:
    - north: keycloak.database
      south: database.database
    - north: keycloak.auth
      south: cache.producer', CURRENT_TIMESTAMP),

-- Distributed Data Platform (composite)
(gen_random_uuid(), 'skupperx.io/toplevel', 'data-platform', 'data.io', 'composite', 2, '{
  "shard_count": {
    "type": "numeric",
    "description": "Number of database shards",
    "default": 3
  },
  "replication_factor": {
    "type": "numeric",
    "description": "Database replication factor",
    "default": 2
  }
}', '{
  "data_api": {
    "role": "api-provider",
    "polarity": "north",
    "maxBindings": "unlimited",
    "data": {"port": 8080, "protocol": "http", "service": "data-access"}
  },
  "admin_api": {
    "role": "api-provider",
    "polarity": "north",
    "maxBindings": 1,
    "data": {"port": 8081, "protocol": "http", "service": "data-admin"}
  }
}', 'apiVersion: skupperx.io/compose/v1alpha1
kind: Block
spec:
  components:
    gateway:
      block: kong-gateway
    primary_db:
      block: postgresql-db
      config:
        database: primary_data
    replica_db:
      block: postgresql-db
      config:
        database: replica_data
    cache_cluster:
      block: redis-queue
    loadbalancer:
      block: haproxy-lb
  bindings:
    - north: loadbalancer.frontend
      south: gateway.api
    - north: gateway.admin
      south: primary_db.database
    - north: primary_db.database
      south: replica_db.database
    - north: gateway.api
      south: cache_cluster.producer', CURRENT_TIMESTAMP);

-- Store library block IDs
INSERT INTO temp_ids (table_name, name, id)
SELECT 'library_blocks', name, id FROM LibraryBlocks;

-- Insert comprehensive sample applications
INSERT INTO Applications (Id, Name, RootBlock, Lifecycle, BuildLog, Derivative, Created) VALUES
-- Production E-Commerce Application
(gen_random_uuid(), 'production-ecommerce', (SELECT id FROM temp_ids WHERE name = 'ecommerce-app'), 'build-complete', 
'Application build completed successfully. All components deployed and bindings verified.', 
'{"instances": 5, "components": ["frontend", "gateway", "userservice", "database", "cache", "loadbalancer"], "total_bindings": 5, "site_allocations": {"worker": 4, "database": 1}}', 
CURRENT_TIMESTAMP - INTERVAL '5 days'),

-- Staging Monitoring Stack
(gen_random_uuid(), 'staging-monitoring', (SELECT id FROM temp_ids WHERE name = 'monitoring-stack'), 'deployed',
'Monitoring stack deployed successfully. Metrics collection active.',
'{"instances": 2, "components": ["prometheus", "database"], "total_bindings": 1, "site_allocations": {"worker": 2}}',
CURRENT_TIMESTAMP - INTERVAL '3 days'),

-- Development Authentication Platform  
(gen_random_uuid(), 'dev-auth-platform', (SELECT id FROM temp_ids WHERE name = 'auth-platform'), 'build-complete',
'Authentication platform build completed. Ready for deployment.',
'{"instances": 3, "components": ["keycloak", "database", "cache"], "total_bindings": 2, "site_allocations": {"worker": 3}}',
CURRENT_TIMESTAMP - INTERVAL '2 days'),

-- Test Data Platform
(gen_random_uuid(), 'test-data-platform', (SELECT id FROM temp_ids WHERE name = 'data-platform'), 'build-warnings',
'Data platform built with warnings. Database replication configuration needs review.',
'{"instances": 5, "components": ["gateway", "primary_db", "replica_db", "cache_cluster", "loadbalancer"], "total_bindings": 4, "site_allocations": {"worker": 3, "database": 2}}',
CURRENT_TIMESTAMP - INTERVAL '1 day'),

-- Simple Web Service Application (using simple blocks)
(gen_random_uuid(), 'simple-web-app', (SELECT id FROM temp_ids WHERE name = 'nginx-frontend'), 'build-complete',
'Simple web application using nginx frontend. Build completed successfully.',
'{"instances": 1, "components": ["nginx-frontend"], "total_bindings": 0, "site_allocations": {"worker": 1}}',
CURRENT_TIMESTAMP - INTERVAL '7 days'),

-- Microservice API Application
(gen_random_uuid(), 'user-api-service', (SELECT id FROM temp_ids WHERE name = 'user-service'), 'build-complete',
'User API microservice built successfully. Database and cache connections configured.',
'{"instances": 1, "components": ["user-service"], "total_bindings": 0, "site_allocations": {"worker": 1}}',
CURRENT_TIMESTAMP - INTERVAL '4 days'),

-- Failed Application Build
(gen_random_uuid(), 'failed-complex-app', (SELECT id FROM temp_ids WHERE name = 'ecommerce-app'), 'build-errors',
'Build failed: Binding validation errors. Interface mismatches between components.',
'{"instances": 0, "components": [], "total_bindings": 0, "site_allocations": {}, "errors": ["Interface binding mismatch", "Configuration validation failed"]}',
CURRENT_TIMESTAMP - INTERVAL '1 hour'),

-- In-Progress Application
(gen_random_uuid(), 'new-monitoring-app', (SELECT id FROM temp_ids WHERE name = 'monitoring-stack'), 'created',
'Application created. Build in progress.',
'{"instances": 0, "components": [], "total_bindings": 0, "site_allocations": {}}',
CURRENT_TIMESTAMP - INTERVAL '30 minutes');

-- Store application IDs  
INSERT INTO temp_ids (table_name, name, id)
SELECT 'applications', name, id FROM Applications;

-- Insert comprehensive instance blocks for applications
INSERT INTO InstanceBlocks (Id, Application, LibraryBlock, InstanceName, Config, Metadata, Derivative) VALUES
-- Production E-Commerce Application Instances
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), (SELECT id FROM temp_ids WHERE name = 'nginx-frontend'), 'frontend', 
'{"replicas": 3, "image": "nginx:1.24", "port": 80}', 
'{"labels": {"app": "ecommerce", "component": "frontend", "tier": "web"}, "annotations": {"deployment.strategy": "rolling"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "500m", "memory": "512Mi"}, "exposed_ports": [80]}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), (SELECT id FROM temp_ids WHERE name = 'kong-gateway'), 'gateway',
'{"admin_port": 8001, "proxy_port": 8000, "image": "kong:3.3"}',
'{"labels": {"app": "ecommerce", "component": "gateway", "tier": "api"}, "annotations": {"rate.limiting": "enabled"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "1000m", "memory": "1Gi"}, "exposed_ports": [8000, 8001]}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), (SELECT id FROM temp_ids WHERE name = 'user-service'), 'userservice',
'{"replicas": 3, "port": 8080, "image": "example.com/user-service:v2.1"}',
'{"labels": {"app": "ecommerce", "component": "userservice", "tier": "business"}, "annotations": {"auto.scaling": "enabled"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "750m", "memory": "1Gi"}, "exposed_ports": [8080, 9090]}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), (SELECT id FROM temp_ids WHERE name = 'postgresql-db'), 'database',
'{"database": "ecommerce_db", "image": "postgres:15.3", "port": 5432}',
'{"labels": {"app": "ecommerce", "component": "database", "tier": "data"}, "annotations": {"backup.enabled": "true"}}',
'{"allocated_to": "database", "resource_requirements": {"cpu": "2000m", "memory": "4Gi"}, "exposed_ports": [5432], "storage": "100Gi"}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), (SELECT id FROM temp_ids WHERE name = 'memcached'), 'cache',
'{"port": 11211, "image": "memcached:1.6.21"}',
'{"labels": {"app": "ecommerce", "component": "cache", "tier": "cache"}, "annotations": {"ttl": "3600"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "500m", "memory": "2Gi"}, "exposed_ports": [11211]}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), (SELECT id FROM temp_ids WHERE name = 'haproxy-lb'), 'loadbalancer',
'{"frontend_port": 80, "stats_port": 8404, "image": "haproxy:2.8"}',
'{"labels": {"app": "ecommerce", "component": "loadbalancer", "tier": "ingress"}, "annotations": {"ssl.redirect": "true"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "500m", "memory": "512Mi"}, "exposed_ports": [80, 8404]}'),

-- Staging Monitoring Stack Instances
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'staging-monitoring'), (SELECT id FROM temp_ids WHERE name = 'prometheus'), 'prometheus',
'{"port": 9090, "retention": "15d", "scrape_interval": "30s"}',
'{"labels": {"app": "monitoring", "component": "prometheus", "tier": "monitoring"}, "annotations": {"retention.policy": "15d"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "1000m", "memory": "2Gi"}, "exposed_ports": [9090], "storage": "50Gi"}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'staging-monitoring'), (SELECT id FROM temp_ids WHERE name = 'postgresql-db'), 'database',
'{"database": "metrics_db", "image": "postgres:15", "port": 5432}',
'{"labels": {"app": "monitoring", "component": "database", "tier": "data"}, "annotations": {"backup.schedule": "daily"}}',
'{"allocated_to": "database", "resource_requirements": {"cpu": "1000m", "memory": "2Gi"}, "exposed_ports": [5432], "storage": "200Gi"}'),

-- Development Authentication Platform Instances
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'dev-auth-platform'), (SELECT id FROM temp_ids WHERE name = 'keycloak-auth'), 'keycloak',
'{"realm": "dev", "theme": "custom", "port": 8080, "admin_port": 9990}',
'{"labels": {"app": "auth", "component": "keycloak", "tier": "auth", "env": "dev"}, "annotations": {"dev.mode": "enabled"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "1000m", "memory": "2Gi"}, "exposed_ports": [8080, 9990]}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'dev-auth-platform'), (SELECT id FROM temp_ids WHERE name = 'postgresql-db'), 'database',
'{"database": "keycloak_db", "image": "postgres:15", "port": 5432}',
'{"labels": {"app": "auth", "component": "database", "tier": "data", "env": "dev"}, "annotations": {"dev.reset": "weekly"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "500m", "memory": "1Gi"}, "exposed_ports": [5432], "storage": "20Gi"}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'dev-auth-platform'), (SELECT id FROM temp_ids WHERE name = 'redis-queue'), 'cache',
'{"port": 6379, "image": "redis:7"}',
'{"labels": {"app": "auth", "component": "cache", "tier": "cache", "env": "dev"}, "annotations": {"persistence": "disabled"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "250m", "memory": "512Mi"}, "exposed_ports": [6379]}'),

-- Test Data Platform Instances 
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'test-data-platform'), (SELECT id FROM temp_ids WHERE name = 'kong-gateway'), 'gateway',
'{"admin_port": 8001, "proxy_port": 8000, "image": "kong:latest"}',
'{"labels": {"app": "dataplatform", "component": "gateway", "tier": "api", "env": "test"}, "annotations": {"test.config": "enabled"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "500m", "memory": "1Gi"}, "exposed_ports": [8000, 8001]}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'test-data-platform'), (SELECT id FROM temp_ids WHERE name = 'postgresql-db'), 'primary_db',
'{"database": "primary_data", "image": "postgres:15", "port": 5432}',
'{"labels": {"app": "dataplatform", "component": "primary-db", "tier": "data", "env": "test"}, "annotations": {"replication.master": "true"}}',
'{"allocated_to": "database", "resource_requirements": {"cpu": "1500m", "memory": "3Gi"}, "exposed_ports": [5432], "storage": "100Gi"}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'test-data-platform'), (SELECT id FROM temp_ids WHERE name = 'postgresql-db'), 'replica_db',
'{"database": "replica_data", "image": "postgres:15", "port": 5432}',
'{"labels": {"app": "dataplatform", "component": "replica-db", "tier": "data", "env": "test"}, "annotations": {"replication.slave": "true"}}',
'{"allocated_to": "database", "resource_requirements": {"cpu": "1000m", "memory": "2Gi"}, "exposed_ports": [5432], "storage": "100Gi"}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'test-data-platform'), (SELECT id FROM temp_ids WHERE name = 'redis-queue'), 'cache_cluster',
'{"port": 6379, "image": "redis:7", "cluster_mode": true}',
'{"labels": {"app": "dataplatform", "component": "cache", "tier": "cache", "env": "test"}, "annotations": {"cluster.enabled": "true"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "750m", "memory": "2Gi"}, "exposed_ports": [6379]}'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'test-data-platform'), (SELECT id FROM temp_ids WHERE name = 'haproxy-lb'), 'loadbalancer',
'{"frontend_port": 80, "stats_port": 8404, "image": "haproxy:2.8"}',
'{"labels": {"app": "dataplatform", "component": "loadbalancer", "tier": "ingress", "env": "test"}, "annotations": {"test.routing": "enabled"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "500m", "memory": "512Mi"}, "exposed_ports": [80, 8404]}'),

-- Simple Web App Instance
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'simple-web-app'), (SELECT id FROM temp_ids WHERE name = 'nginx-frontend'), 'frontend',
'{"replicas": 1, "image": "nginx:latest", "port": 80}',
'{"labels": {"app": "simpleweb", "component": "frontend", "tier": "web"}, "annotations": {"simple.app": "true"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "250m", "memory": "256Mi"}, "exposed_ports": [80]}'),

-- User API Service Instance
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'user-api-service'), (SELECT id FROM temp_ids WHERE name = 'user-service'), 'userservice',
'{"replicas": 2, "port": 8080, "image": "example.com/user-service:v1.0"}',
'{"labels": {"app": "userapi", "component": "userservice", "tier": "api"}, "annotations": {"standalone.service": "true"}}',
'{"allocated_to": "worker", "resource_requirements": {"cpu": "500m", "memory": "1Gi"}, "exposed_ports": [8080, 9090]}');

-- Store instance block IDs
INSERT INTO temp_ids (table_name, name, id)
SELECT 'instance_blocks', CONCAT(name, '-', instancename), id FROM InstanceBlocks 
JOIN Applications ON Applications.Id = InstanceBlocks.Application;

-- Insert comprehensive interface bindings for applications
INSERT INTO Bindings (Application, NorthBlock, NorthInterface, SouthBlock, SouthInterface) VALUES
-- Production E-Commerce Application Bindings
((SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), 'loadbalancer', 'frontend', 'frontend', 'frontend'),
((SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), 'loadbalancer', 'backend', 'gateway', 'api'),
((SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), 'gateway', 'admin', 'userservice', 'api'),
((SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), 'userservice', 'database', 'database', 'database'),
((SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), 'userservice', 'cache', 'cache', 'cache'),
((SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), 'userservice', 'metrics', 'prometheus', 'metrics'),

-- Staging Monitoring Stack Bindings  
((SELECT id FROM temp_ids WHERE name = 'staging-monitoring'), 'prometheus', 'metrics', 'database', 'database'),

-- Development Authentication Platform Bindings
((SELECT id FROM temp_ids WHERE name = 'dev-auth-platform'), 'keycloak', 'database', 'database', 'database'),
((SELECT id FROM temp_ids WHERE name = 'dev-auth-platform'), 'keycloak', 'auth', 'cache', 'producer'),

-- Test Data Platform Bindings
((SELECT id FROM temp_ids WHERE name = 'test-data-platform'), 'loadbalancer', 'frontend', 'gateway', 'api'),
((SELECT id FROM temp_ids WHERE name = 'test-data-platform'), 'gateway', 'admin', 'primary_db', 'database'),
((SELECT id FROM temp_ids WHERE name = 'test-data-platform'), 'primary_db', 'database', 'replica_db', 'database'),
((SELECT id FROM temp_ids WHERE name = 'test-data-platform'), 'gateway', 'api', 'cache_cluster', 'producer');

-- Insert deployed applications (applications deployed to VANs)
INSERT INTO DeployedApplications (Id, Application, Van, Lifecycle, DeployLog) VALUES
(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'production-ecommerce'), (SELECT id FROM temp_ids WHERE name = 'production-van'), 'deployed', 
'Deployment completed successfully. All components are running and healthy. Load balancer configured with SSL termination.'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'staging-monitoring'), (SELECT id FROM temp_ids WHERE name = 'staging-van'), 'deployed',
'Monitoring stack deployed successfully. Prometheus is collecting metrics from all configured targets.'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'dev-auth-platform'), (SELECT id FROM temp_ids WHERE name = 'development-van'), 'deploy-warnings',
'Authentication platform deployed with warnings. Database connection pool configuration needs optimization.'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'simple-web-app'), (SELECT id FROM temp_ids WHERE name = 'production-van'), 'deployed',
'Simple web application deployed successfully. Frontend is serving traffic.'),

(gen_random_uuid(), (SELECT id FROM temp_ids WHERE name = 'test-data-platform'), (SELECT id FROM temp_ids WHERE name = 'development-van'), 'deploy-errors',
'Data platform deployment failed. Database replication configuration errors detected.');

-- Clean up temp table
DROP TABLE temp_ids;

-- Final comprehensive verification queries
SELECT 'TLS Certificates' as Entity, COUNT(*) as Count FROM tlscertificates
UNION ALL
SELECT 'Backbones', COUNT(*) FROM backbones
UNION ALL
SELECT 'Interior Sites', COUNT(*) FROM interiorsites
UNION ALL
SELECT 'Access Points', COUNT(*) FROM backboneaccesspoints
UNION ALL
SELECT 'Links', COUNT(*) FROM interrouterlinks
UNION ALL
SELECT 'VANs', COUNT(*) FROM applicationnetworks
UNION ALL
SELECT 'Member Sites', COUNT(*) FROM membersites
UNION ALL
SELECT 'Invitations', COUNT(*) FROM memberinvitations
UNION ALL
SELECT 'Interface Roles', COUNT(*) FROM InterfaceRoles
UNION ALL  
SELECT 'Block Types', COUNT(*) FROM BlockTypes
UNION ALL
SELECT 'Library Blocks', COUNT(*) FROM LibraryBlocks
UNION ALL
SELECT 'Applications', COUNT(*) FROM Applications
UNION ALL
SELECT 'Instance Blocks', COUNT(*) FROM InstanceBlocks
UNION ALL
SELECT 'Bindings', COUNT(*) FROM Bindings
UNION ALL
SELECT 'Deployed Apps', COUNT(*) FROM DeployedApplications;

-- Summary statistics by state
SELECT 'Backbone States' as Category, lifecycle as State, COUNT(*) as Count 
FROM backbones 
GROUP BY lifecycle
UNION ALL
SELECT 'Site States', lifecycle, COUNT(*) 
FROM interiorsites 
GROUP BY lifecycle
UNION ALL
SELECT 'Access Point States', lifecycle, COUNT(*) 
FROM backboneaccesspoints 
GROUP BY lifecycle
UNION ALL
SELECT 'VAN States', lifecycle, COUNT(*) 
FROM applicationnetworks 
GROUP BY lifecycle
UNION ALL
SELECT 'Member Site States', lifecycle, COUNT(*) 
FROM membersites 
GROUP BY lifecycle
UNION ALL
SELECT 'Invitation States', lifecycle, COUNT(*) 
FROM memberinvitations 
GROUP BY lifecycle
UNION ALL
SELECT 'Application States', lifecycle, COUNT(*) 
FROM Applications 
GROUP BY lifecycle
UNION ALL
SELECT 'Deployment States', lifecycle, COUNT(*) 
FROM DeployedApplications 
GROUP BY lifecycle;

-- Library block statistics by type and body style
SELECT 'Library Block Types' as Category, type as Type, COUNT(*) as Count
FROM LibraryBlocks
GROUP BY type
ORDER BY COUNT(*) DESC;

SELECT 'Library Block Body Styles' as Category, bodystyle as Style, COUNT(*) as Count
FROM LibraryBlocks
GROUP BY bodystyle;

-- Application complexity statistics
SELECT 'Application Complexity' as Category, 
       CASE 
         WHEN ib_count <= 1 THEN 'Simple (1 component)'
         WHEN ib_count <= 3 THEN 'Medium (2-3 components)'
         WHEN ib_count <= 6 THEN 'Complex (4-6 components)'
         ELSE 'Very Complex (>6 components)'
       END as Complexity,
       COUNT(*) as Applications
FROM (
  SELECT Applications.Name, COUNT(InstanceBlocks.Id) as ib_count
  FROM Applications
  LEFT JOIN InstanceBlocks ON Applications.Id = InstanceBlocks.Application
  GROUP BY Applications.Id, Applications.Name
) app_stats
GROUP BY 
  CASE 
    WHEN ib_count <= 1 THEN 'Simple (1 component)'
    WHEN ib_count <= 3 THEN 'Medium (2-3 components)'
    WHEN ib_count <= 6 THEN 'Complex (4-6 components)'
    ELSE 'Very Complex (>6 components)'
  END;

-- Interface role usage statistics
SELECT 'Interface Role Usage' as Category, name as Role, 
       (LENGTH(lib_blocks.interfaces_text) - LENGTH(REPLACE(lib_blocks.interfaces_text, name, ''))) / LENGTH(name) as Usage_Count
FROM InterfaceRoles
CROSS JOIN (SELECT STRING_AGG(interfaces, ' ') as interfaces_text FROM LibraryBlocks WHERE interfaces IS NOT NULL) lib_blocks
WHERE lib_blocks.interfaces_text LIKE '%' || name || '%'
ORDER BY Usage_Count DESC;

-- Deployment success rate
SELECT 'Deployment Success Rate' as Metric,
       ROUND(
         (COUNT(CASE WHEN lifecycle = 'deployed' THEN 1 END) * 100.0 / COUNT(*)), 2
       ) || '%' as Value
FROM DeployedApplications;