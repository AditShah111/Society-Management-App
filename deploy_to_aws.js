const { 
  EC2Client, 
  CreateSecurityGroupCommand, 
  AuthorizeSecurityGroupIngressCommand, 
  CreateKeyPairCommand, 
  RunInstancesCommand, 
  DescribeInstancesCommand,
  DescribeImagesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { Client } = require('ssh2');

const REGION = "ap-south-1";
const ec2 = new EC2Client({ region: REGION });

async function getLatesAl2023Ami() {
  console.log("🔍 Fetching latest Amazon Linux 2023 AMI ID...");
  const command = new DescribeImagesCommand({
    Filters: [
      { Name: "name", Values: ["al2023-ami-202*-kernel-*-x86_64"] },
      { Name: "owner-alias", Values: ["amazon"] },
      { Name: "state", Values: ["available"] }
    ]
  });
  try {
    const res = await ec2.send(command);
    const sorted = res.Images.sort((a, b) => b.CreationDate.localeCompare(a.CreationDate));
    if (sorted.length > 0) {
      console.log(`✓ Resolved AMI: ${sorted[0].ImageId} (${sorted[0].Name})`);
      return sorted[0].ImageId;
    }
  } catch (err) {
    console.error("❌ Failed to resolve AMI:", err.message);
  }
  // Fallback to a known AL2023 AMI in ap-south-1
  return "ami-053b12d3152c0cc71";
}

async function getVpcAndSubnet() {
  console.log("🔍 Finding default VPC and Subnets...");
  try {
    const vpcsRes = await ec2.send(new DescribeVpcsCommand({
      Filters: [{ Name: "is-default", Values: ["true"] }]
    }));
    const vpcId = vpcsRes.Vpcs[0]?.VpcId;
    if (!vpcId) throw new Error("No default VPC found.");

    const subnetsRes = await ec2.send(new DescribeSubnetsCommand({
      Filters: [{ Name: "vpc-id", Values: [vpcId] }]
    }));
    const subnetId = subnetsRes.Subnets[0]?.SubnetId;
    if (!subnetId) throw new Error("No default subnets found.");

    console.log(`✓ Found default VPC: ${vpcId}, Subnet: ${subnetId}`);
    return { vpcId, subnetId };
  } catch (err) {
    console.error("❌ VPC Search failed:", err.message);
    throw err;
  }
}

async function setupSecurityGroup(vpcId) {
  const groupName = `society-app-sg-${Date.now()}`;
  console.log(`🛡️ Creating Security Group: ${groupName}...`);
  try {
    const createRes = await ec2.send(new CreateSecurityGroupCommand({
      GroupName: groupName,
      Description: "Security Group for Society App",
      VpcId: vpcId
    }));
    const groupId = createRes.GroupId;
    console.log(`✓ Created Security Group ID: ${groupId}`);

    console.log("🔒 Adding ingress rules for Port 80 (HTTP) and Port 22 (SSH)...");
    await ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: groupId,
      IpPermissions: [
        {
          IpProtocol: "tcp",
          FromPort: 80,
          ToPort: 80,
          IpRanges: [{ CidrIp: "0.0.0.0/0" }]
        },
        {
          IpProtocol: "tcp",
          FromPort: 22,
          ToPort: 22,
          IpRanges: [{ CidrIp: "0.0.0.0/0" }]
        }
      ]
    }));
    console.log("✓ Ingress rules configured.");
    return groupId;
  } catch (err) {
    console.error("❌ Failed to setup Security Group:", err.message);
    throw err;
  }
}

async function setupKeyPair() {
  const keyName = `society-key-${Date.now()}`;
  console.log(`🔑 Generating EC2 Key Pair: ${keyName}...`);
  try {
    const res = await ec2.send(new CreateKeyPairCommand({ KeyName: keyName }));
    const pemPath = path.join(__dirname, `${keyName}.pem`);
    fs.writeFileSync(pemPath, res.KeyMaterial, { mode: 0o400 });
    console.log(`✓ Key Pair saved to: ${pemPath}`);
    return { keyName, pemPath };
  } catch (err) {
    console.error("❌ Key Pair generation failed:", err.message);
    throw err;
  }
}

function zipProject() {
  return new Promise((resolve, reject) => {
    const zipPath = path.join(__dirname, 'app.zip');
    console.log(`📦 Creating project ZIP archive: ${zipPath}...`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✓ Zip complete: ${archive.pointer()} total bytes`);
      resolve(zipPath);
    });
    archive.on('error', err => reject(err));

    archive.pipe(output);
    // Add all files except node_modules, zip files, and git folders
    archive.glob('**/*', {
      cwd: __dirname,
      ignore: ['node_modules/**', '.git/**', 'app.zip', '*.pem', '*.zip', 'aws_secure_*.md']
    });
    archive.finalize();
  });
}

async function launchInstance(amiId, subnetId, groupId, keyName) {
  console.log("🚀 Launching t2.micro EC2 Instance...");
  const command = new RunInstancesCommand({
    ImageId: amiId,
    InstanceType: "t2.micro",
    MinCount: 1,
    MaxCount: 1,
    KeyName: keyName,
    NetworkInterfaces: [
      {
        DeviceIndex: 0,
        SubnetId: subnetId,
        Groups: [groupId],
        AssociatePublicIpAddress: true
      }
    ],
    TagSpecifications: [
      {
        ResourceType: "instance",
        Tags: [{ Key: "Name", Value: "SocietyManagementServer" }]
      }
    ]
  });

  const res = await ec2.send(command);
  const instanceId = res.Instances[0].InstanceId;
  console.log(`✓ Instance initiated. ID: ${instanceId}`);
  return instanceId;
}

async function waitForInstanceRunning(instanceId) {
  console.log("⏳ Waiting for instance to enter 'running' state...");
  const command = new DescribeInstancesCommand({ InstanceIds: [instanceId] });
  
  while (true) {
    const res = await ec2.send(command);
    const instance = res.Reservations[0].Instances[0];
    const state = instance.State.Name;
    console.log(`   Current state: ${state}`);
    
    if (state === "running") {
      const publicIp = instance.PublicIpAddress;
      console.log(`✓ Instance is running! Public IP: ${publicIp}`);
      return publicIp;
    }
    if (state === "terminated" || state === "stopped") {
      throw new Error(`Instance failed state cycle: ${state}`);
    }
    await new Promise(r => setTimeout(r, 8000));
  }
}

function runSshCommands(ip, pemPath, dbUrl) {
  return new Promise((resolve, reject) => {
    console.log("🔌 Connecting to EC2 instance via SSH...");
    const conn = new Client();
    
    conn.on('ready', () => {
      console.log("✓ SSH Connection established. Running deployment commands...");
      
      const script = `
        set -e
        echo "Installing Node.js and Unzip..."
        sudo dnf update -y
        sudo dnf install -y nodejs unzip
        
        echo "Extracting code..."
        mkdir -p ~/app
        unzip -o ~/app.zip -d ~/app
        cd ~/app
        
        echo "Installing production node modules..."
        npm install --production
        
        echo "Writing environment variables..."
        echo "DATABASE_URL=${dbUrl}" > .env
        echo "PORT=3001" >> .env
        
        echo "Configuring iptables port forwarding (80 -> 3001)..."
        sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-ports 3001
        
        echo "Configuring systemd service..."
        sudo tee /etc/systemd/system/society-app.service << 'EOF'
[Unit]
Description=Society App Service
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/app
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

        echo "Starting society-app service..."
        sudo systemctl daemon-reload
        sudo systemctl enable society-app
        sudo systemctl start society-app
        echo "✓ Server successfully configured!"
      `;
      
      conn.exec(script, (err, stream) => {
        if (err) return reject(err);
        stream.on('close', (code, signal) => {
          conn.end();
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`SSH execution failed with exit code ${code}`));
          }
        }).on('data', (data) => {
          process.stdout.write(data.toString('utf8'));
        }).stderr.on('data', (data) => {
          process.stderr.write(data.toString('utf8'));
        });
      });
    }).connect({
      host: ip,
      port: 22,
      username: 'ec2-user',
      privateKey: fs.readFileSync(pemPath)
    });
  });
}

function uploadZip(ip, pemPath, zipPath) {
  return new Promise((resolve, reject) => {
    console.log("📤 Uploading zip archive via SFTP...");
    const conn = new Client();
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        sftp.fastPut(zipPath, 'app.zip', {}, (uploadErr) => {
          conn.end();
          if (uploadErr) {
            reject(uploadErr);
          } else {
            console.log("✓ Upload complete.");
            resolve();
          }
        });
      });
    }).connect({
      host: ip,
      port: 22,
      username: 'ec2-user',
      privateKey: fs.readFileSync(pemPath)
    });
  });
}

async function run() {
  console.log("=== AWS EC2 AUTOMATED DEPLOYMENT SCRIPT ===");
  try {
    // 1. Resolve configuration
    const envContent = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const dbUrlMatch = envContent.match(/^DATABASE_URL=(.+)$/m);
    if (!dbUrlMatch) {
      throw new Error("DATABASE_URL is missing in local .env file");
    }
    const dbUrl = dbUrlMatch[1].trim();

    const amiId = await getLatesAl2023Ami();
    const { vpcId, subnetId } = await getVpcAndSubnet();
    const groupId = await setupSecurityGroup(vpcId);
    const { keyName, pemPath } = await setupKeyPair();
    const zipPath = await zipProject();

    // 2. Launch
    const instanceId = await launchInstance(amiId, subnetId, groupId, keyName);
    const publicIp = await waitForInstanceRunning(instanceId);

    // Wait a brief moment for SSH service to start on instance
    console.log("⏳ Waiting 15 seconds for SSH service initialization...");
    await new Promise(r => setTimeout(r, 15000));

    // 3. Upload & Deploy
    await uploadZip(publicIp, pemPath, zipPath);
    await runSshCommands(publicIp, pemPath, dbUrl);

    console.log(`\n==========================================`);
    console.log(`🎉 DEPLOYMENT SUCCESSFUL!`);
    console.log(`🔗 APP URL: http://${publicIp}`);
    console.log(`==========================================\n`);
  } catch (error) {
    console.error("\n❌ DEPLOYMENT FAILED:", error.message);
  }
}

run();
