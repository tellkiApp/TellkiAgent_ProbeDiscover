//node probe_discover_monitor.js "{127.0.0.1;},{192.168.69.*;public},{192.168.69.13-20;}" "" "" ""

var ping = require ("ping");
var wmiLib = require("./wmi/index.js");
var dns = require("dns");
var snmp = require("net-snmp");

var ORIGIN_ID_WMI = "7";

var ORIGIN_ID_SNMP = "6";

var ORIGIN_ID_HOSTNAME = "5";

// --

var SNMP_OID_SYSTEM_OBJECT_ID = "1.3.6.1.2.1.1.2.0";

var SNMP_OID_SYSTEM_NAME = "1.3.6.1.2.1.1.5.0";

var SNMP_OID_SYSTEM_DESCRIPTION = "1.3.6.1.2.1.1.1.0";



//####################### EXCEPTIONS ################################

function InvalidParametersNumberError() {
    this.name = "InvalidParametersNumberError";
    this.message = ("Wrong number of parameters.");
}
InvalidParametersNumberError.prototype = Object.create(Error.prototype);
InvalidParametersNumberError.prototype.constructor = InvalidParametersNumberError;


// ############# INPUT ###################################

(function() {
	try
	{
		monitorInput(process.argv.slice(2));
	}
	catch(err)
	{	
		if(err instanceof InvalidParametersNumberError)
		{
			console.log(err.message);
			process.exit(3);
		}
		else
		{
			console.log(err.message);
			process.exit(1);
		}
	}
}).call(this)



function monitorInput(args)
{
	
	if(args.length !== 4)
	{
		throw new InvalidParametersNumberError()
	}

	monitorInputProcess(args);
	
}


function monitorInputProcess(args)
{
	var ipRangesList = args[0];

	var username = args[1];

	var password = args[2];

	var domain = args[3];

	// Create IP list.

	var ipRanges = ipRangesList.split(",");

	var ipList = [];

	for (var i in ipRanges)
	{
		var ipRange = ipRanges[i];
		
		ipRange = ipRange.replace(/{/g, "");
		ipRange = ipRange.replace(/}/g, "");
		
		var parts = ipRange.split(";");
		ipRange = parts[0];
		var community = "";
		
		if (parts.length == 2)
		{
			community = parts[1];
		}

		var ips = generateListFromPattern(ipRange);
		
		//console.log(ips)
		
		for (var j in ips)
		{
			ipList.push(ips[j] + ";" + community);
		}
	}
	
	
	var request = new Object()
	request.ipList = ipList;
	request.username = username;
	request.password = password;
	request.domain = domain;

	//console.log(JSON.stringify(requests));
	
	monitorProbeDiscover(request);
	
}


//####################################

function generateListFromPattern(pattern)
{
	var newIPs = [];
	
	var octets = pattern.split(".");

	
	for (var i in octets)
	{
		var octet = octets[i]
		
		var newParts = processOctet(octet);
		
		if (newIPs.length == 0)
		{
			for (var i in newParts)
			{
				newIPs.push(newParts[i]);
			}
		}
		else
		{
			var newIPsTemp = [];

			for (var i = 0; i < newIPs.length; i++)
			{
				for (var j in newParts)
				{
					newIPsTemp.push(newIPs[i] + "." + newParts[j]);
				}
			}

			
			
			newIPs = newIPsTemp;
		}
	}

	return newIPs;
}


	
function processOctet(octet)
{
	if (octet === "*")
	{
		var newOctets = new Array(255);

		for (var i = 1; i < 256; i++)
		{
			newOctets[i - 1] = i + "";
		}
		
		return newOctets;
	}
	else if (octet.indexOf("-") > -1)
	{
		var tokens = octet.split("-");

		var from = parseInt(tokens[0]);
		var to = parseInt(tokens[1]);
		
		if (from <= to)
		{
			var newOctets = new Array(to - from + 1);

			for (var i = from, j = 0; i <= to; i++, j++)
			{
				newOctets[j] = i + "";
			}

			return newOctets;
		}

		return null;
	}
	else
	{
		return new Array ( octet );
	}
}



//################### OUTPUT ###########################


function output(request, info, ip)
{
	var out = "";
	out += new Date().toISOString();
	out += "|";
	out += info.infoType;
	out += "|";
	out += "0";
	out += "|";
	out += ip;
	out += "|";
	out += info.hostname;
	out += "|";
	out += info.oid;
	out += "|";
	out += info.hostDescription;
	out += "|";
	out += info.hostOS;
	out += "|";
	out += info.hostManufacturer;
	out += "|";
	out += info.hostModel;
	out += "|";
	out += info.hostOSBuild;
	
	console.log(out);
	
}





// ################# MONITOR ###########################
function monitorProbeDiscover(request) 
{
	var outputDataList = [];
	
	for (var i in request.ipList)
	{
		var ipAddress = request.ipList[i];
		
		var info = new Object();

		info.infoType = null;
		info.hostname = "";
		info.oid = "";
		info.hostDescription = "";
		info.hostOS = "";
		info.hostManufacturer = "";
		info.hostModel = "";
		info.hostOSBuild = "";

		// --

		var parts = ipAddress.split(";");

		ipAddress = parts[0];

		var community = "";

		if (parts.length == 2)
		{
			community = parts[1];
		}


		// Ping
		pingTarget(request, info, ipAddress, community)

	}
	
		
	
}

// ########## PING ##################
function pingTarget(request, info, ip, community)
{
	ping.sys.probe(ip, function(isAlive){
		if(isAlive)
		{
			//console.log(ip + " is alive")
			wmiTarget(request, info, ip, community)
		}
	})
}


// ############### WMI #########################
function wmiTarget(request, info, ip, community)
{
	//console.log(ip);
	//console.log("wmilog: "+ip + " | "+ request.domain +" | " + request.username+ " | " + request.password);
	wmiLib.connect(ip, request.domain, request.username, request.password, function(err, wmi){
	
		var buildVersion = "", dnsHostName = "", model = "", manufacturer = "", caption = "";
		
	
		if(err)
		{
			snmpTarget(request, info, ip, community);
			wmi.dispose();
		}
		else
		{
			wmi.query("select BuildVersion from Win32_WMISetting", function(err, results) { 
			
				if(!err)
				{
					if (results !== undefined && results !== null && results.constructor === Array) 
					{
						buildVersion = results[0]['BuildVersion'];
					}
					
					
					wmi.query("select DNSHostName, Model, Manufacturer from Win32_ComputerSystem", function(err, results) { 
			
						if(!err)
						{
							if (results !== undefined && results !== null && results.constructor === Array) 
							{
								dnsHostName = results[0]['DNSHostName'];
								model = results[0]['Model'];
								manufacturer = results[0]['Manufacturer'];
							}
							
							
							wmi.query("select Caption from Win32_OperatingSystem", function(err, results) { 
			
								if(!err)
								{
									if (results !== undefined && results !== null && results.constructor === Array) 
									{
										caption = results[0]['Caption'];
									}
									
									info.infoType = ORIGIN_ID_WMI;
									info.hostname = dnsHostName;
									info.oid = "";
									info.hostDescription = "";
									info.hostOS = caption;
									info.hostManufacturer = manufacturer;
									info.hostModel = model;
									info.hostOSBuild = buildVersion;
									
									output(request, info, ip);
									
								}
								else
								{
									snmpTarget(request, info, ip, community);
								}
								
								wmi.dispose();
					
							});
							
						}
						else
						{
							wmi.dispose();
							snmpTarget(request, info, ip, community);
						}
					
					});
					
				}
				else
				{
					wmi.dispose();
					snmpTarget(request, info, ip, community);
				}
			
			});
		}
	});
	
}

// ################ SNMP ######################

function snmpTarget(request, info, ip, community) 
{
	var oids = [];	
	oids.push(SNMP_OID_SYSTEM_OBJECT_ID);
	oids.push(SNMP_OID_SYSTEM_NAME);
	oids.push(SNMP_OID_SYSTEM_DESCRIPTION);

	var options = {
		port: 161,
		version: snmp.Version1
	};
	
	
	var session = snmp.createSession (ip, community, options);

	session.get (oids, function (error, varbinds) 
	{
		if (error) 
		{	
			hostnameTarget(request, info, ip)
		} 
		else 
		{
			info.infoType = ORIGIN_ID_SNMP;
			info.oid = ""+varbinds[0].value;
			info.hostname = ""+varbinds[1].value;
			info.hostDescription = ""+varbinds[2].value;
			
			output(request, info, ip);
		}
		
		
		session.close();
				
	});
	
	session.on ("error", function(err)
	{
		session.close();
	});
}




// ############### DNS REVERSE ################
function hostnameTarget(request, info, ip)
{
	dns.reverse(ip, function(err, domains)
	{
		info.infoType = ORIGIN_ID_HOSTNAME;
		
		if(!err)
		{
			if(domains.length === 0)
			{
				info.hostname = "";
			}
			else
			{
				info.hostname = domains[0];
			}
			
			
		}
		
		output(request, info, ip);
	});
}









