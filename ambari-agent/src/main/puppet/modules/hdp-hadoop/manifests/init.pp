#
#
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
#
#
#singleton for use with <||> form so that namenode, datanode, etc can pass state to hdp-hadoop and still use include
define hdp-hadoop::common(
  $service_states = []
)
{
  class { 'hdp-hadoop':
    service_states => $service_states    
  }
  anchor{'hdp-hadoop::common::begin':} -> Class['hdp-hadoop'] -> anchor{'hdp-hadoop::common::end':} 
}

class hdp-hadoop::initialize()
{
  if ($hdp::params::component_exists['hdp-hadoop'] == true) {
  } else {
    $hdp::params::component_exists['hdp-hadoop'] = true
  }
  hdp-hadoop::common { 'common':}
  anchor{'hdp-hadoop::initialize::begin':} -> Hdp-hadoop::Common['common'] -> anchor{'hdp-hadoop::initialize::end':}
}

class hdp-hadoop(
  $service_states  = []
)
{
  include configgenerator

  configgenerator::configfile('hdfs-site.xml': 
    module => 'hdp-hadoop',
    properties => {'dfs.name.dir' => '<%=scope.function_hdp_template_var("dfs_name_dir")%>',
      'dfs.support.append' => '<%=scope.function_hdp_template_var("dfs_support_append")%>',
      'dfs.webhdfs.enabled' => '<%=scope.function_hdp_template_var("dfs_webhdfs_enabled")%>',
      'dfs.datanode.failed.volumes.tolerated' => '<%=scope.function_hdp_template_var("dfs_datanode_failed_volume_tolerated")%>',
      'dfs.block.local-path-access.user' => '<%=scope.function_hdp_template_var("dfs_block_local_path_access_user")%>',
      'dfs.data.dir' => '<%=scope.function_hdp_template_var("dfs_data_dir")%>'},)
  
  include hdp-hadoop::params
  $hadoop_config_dir = $hdp-hadoop::params::conf_dir
  $mapred_user = $hdp-hadoop::params::mapred_user  
  $hdfs_user = $hdp-hadoop::params::hdfs_user  

  anchor{'hdp-hadoop::begin':} 
  anchor{'hdp-hadoop::end':} 

  if ('uninstalled' in $service_states) {
    hdp-hadoop::package { 'hadoop':
      ensure => 'uninstalled'
    }

    hdp::directory_recursive_create { $hadoop_config_dir:
      service_state => $service_state,
      force => true
    }

    Anchor['hdp-hadoop::begin'] -> Hdp-hadoop::Package<||> -> Hdp::Directory_recursive_create[$hadoop_config_dir] -> Anchor['hdp-hadoop::end']
  } else {
    
    hdp-hadoop::package { 'hadoop':}


    hdp::directory_recursive_create { $hadoop_config_dir:
      service_state => $service_state,
      force => true
    }
 
    hdp::user{ $hdfs_user:}
    hdp::user { $mapred_user:}

    $logdirprefix = $hdp-hadoop::params::hadoop_logdirprefix
    hdp::directory_recursive_create { $logdirprefix: 
        owner => 'root'
    }
    $piddirprefix = $hdp-hadoop::params::hadoop_piddirprefix
    hdp::directory_recursive_create { $piddirprefix: 
        owner => 'root'
    }
 
    #taskcontroller.cfg properties conditional on security
    if ($hdp::params::security_enabled == true) {
      file { "${hdp::params::hadoop_bin}/task-controller":
        owner   => 'root',
        group   => $hdp::params::hadoop_user_group,
        mode    => '6050',
        require => Hdp-hadoop::Package['hadoop'],
        before  => Anchor['hdp-hadoop::end']
      }
      $tc_owner = 'root'
      $tc_mode = '0400'
    } else {
      $tc_owner = $hdfs_user
      $tc_mode = undef
    }
    hdp-hadoop::configfile { 'taskcontroller.cfg' :
      tag   => 'common',
      owner => $tc_owner,
      mode  => $tc_mode
    }

    $template_files = ['hadoop-env.sh','core-site.xml','hadoop-policy.xml','health_check','capacity-scheduler.xml','commons-logging.properties','log4j.properties','mapred-queue-acls.xml','slaves']
    hdp-hadoop::configfile { $template_files:
      tag   => 'common', 
      owner => $hdfs_user
    }
    
    hdp-hadoop::configfile { 'hadoop-metrics2.properties' : 
      tag   => 'common', 
      owner => $hdfs_user,
    }

    hdp-hadoop::configfile { 'mapred-site.xml': 
      tag => 'common', 
      owner => $mapred_user
    }

    Anchor['hdp-hadoop::begin'] -> Hdp-hadoop::Package<||> ->  Hdp::Directory_recursive_create[$hadoop_config_dir] ->  Hdp::User<|title == $hdfs_user or title == $mapred_user|> 
    -> Hdp-hadoop::Configfile<|tag == 'common'|> -> Anchor['hdp-hadoop::end']
    Anchor['hdp-hadoop::begin'] -> Hdp::Directory_recursive_create[$logdirprefix] -> Anchor['hdp-hadoop::end']
    Anchor['hdp-hadoop::begin'] -> Hdp::Directory_recursive_create[$piddirprefix] -> Anchor['hdp-hadoop::end']
  }
}

class hdp-hadoop::enable-ganglia()
{
  Hdp-hadoop::Configfile<|title  == 'hadoop-metrics2.properties'|>{template_tag => 'GANGLIA'}
}

###config file helper
define hdp-hadoop::configfile(
  $owner = undef,
  $hadoop_conf_dir = $hdp-hadoop::params::conf_dir,
  $mode = undef,
  $namenode_host = undef,
  $jtnode_host = undef,
  $snamenode_host = undef,
  $template_tag = undef,
  $size = undef, #TODO: deprecate
  $sizes = []
) 
{
  #TODO: may need to be fixed 
  if ($jtnode_host == undef) {
    $calc_jtnode_host = $namenode_host
  } else {
    $calc_jtnode_host = $jtnode_host 
  }
 
  #only set 32 if theer is a 32 bit component and no 64 bit components
  if (64 in $sizes) {
    $common_size = 64
  } elsif (32 in $sizes) {
    $common_size = 32
  } else {
    $common_size = 6
  }
  
  hdp::configfile { "${hadoop_conf_dir}/${name}":
    component      => 'hadoop',
    owner          => $owner,
    mode           => $mode,
    namenode_host  => $namenode_host,
    snamenode_host => $snamenode_host,
    jtnode_host    => $calc_jtnode_host,
    template_tag   => $template_tag,
    size           => $common_size
  }
}

#####
define hdp-hadoop::exec-hadoop(
  $command,
  $unless = undef,
  $refreshonly = undef,
  $echo_yes = false,
  $kinit_override = false,
  $tries = 1,
  $timeout = 900,
  $try_sleep = undef,
  $user = undef,
  $logoutput = undef
)
{
  include hdp-hadoop::params
  $security_enabled = $hdp::params::security_enabled
  $conf_dir = $hdp-hadoop::params::conf_dir
  $hdfs_user = $hdp-hadoop::params::hdfs_user

  if ($user == undef) {
    $run_user = $hdfs_user
  } else {
    $run_user = $user
  }

  if (($security_enabled == true) and ($kinit_override == false)) {
    #TODO: may figure out so dont need to call kinit if auth in caceh already
    if ($run_user in [$hdfs_user,'root']) {
      $keytab = "${hdp-hadoop::params::keytab_path}/${hdfs_user}.headless.keytab"
      $principal = $hdfs_user
    } else {
      $keytab = "${hdp-hadoop::params::keytab_path}/${user}.headless.keytab" 
      $principal = $user
    }
    $kinit_if_needed = "/usr/kerberos/bin/kinit  -kt ${keytab} ${principal}; "
  } else {
    $kinit_if_needed = ""
  }
 
  if ($echo_yes == true) {
    $cmd = "${kinit_if_needed}yes Y | hadoop --config ${conf_dir} ${command}"
  } else {
    $cmd = "${kinit_if_needed}hadoop --config ${conf_dir} ${command}"
  }

  hdp::exec { $cmd:
    command     => $cmd,
    user        => $run_user,
    unless      => $unless,
    refreshonly => $refreshonly,
    tries       => $tries,
    timeout     => $timeout,
    try_sleep   => $try_sleep,
    logoutput   => $logoutput
  }
}