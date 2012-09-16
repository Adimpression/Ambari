/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


package org.apache.ambari.server.state.live.host;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

import org.apache.ambari.server.agent.DiskInfo;
import org.apache.ambari.server.agent.HostInfo;
import org.apache.ambari.server.state.fsm.InvalidStateTransitonException;
import org.apache.ambari.server.state.fsm.SingleArcTransition;
import org.apache.ambari.server.state.fsm.StateMachine;
import org.apache.ambari.server.state.fsm.StateMachineFactory;
import org.apache.ambari.server.state.live.AgentVersion;
import org.apache.ambari.server.state.live.job.Job;
import org.apache.ambari.server.state.live.host.HostHealthStatus.HealthStatus;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;

public class HostImpl implements Host {

  private static final Log LOG = LogFactory.getLog(HostImpl.class);

  private final Lock readLock;
  private final Lock writeLock;

  /**
   * Host hostname
   */
  private String hostName;

  /**
   * Host IP if ipv4 interface available
   */
  private String ipv4;

  /**
   * Host IP if ipv6 interface available
   */
  private String ipv6;

  /**
   * Count of cores on Host
   */
  private int cpuCount;

  /**
   * Os Architecture
   */
  private String osArch;

  /**
   * OS Type
   */
  private String osType;

  /**
   * OS Information
   */
  private String osInfo;

  /**
   * Amount of available memory for the Host
   */
  private long availableMemBytes;

  /**
   * Amount of physical memory for the Host
   */
  private long totalMemBytes;

  /**
   * Disks mounted on the Host
   */
  private List<DiskInfo> disksInfo;

  /**
   * Last heartbeat timestamp from the Host
   */
  private long lastHeartbeatTime;

  /**
   * Last registration timestamp for the Host
   */
  private long lastRegistrationTime;

  /**
   * Rack to which the Host belongs to
   */
  private String rackInfo;

  /**
   * Additional Host attributes
   */
  private Map<String, String> hostAttributes;

  /**
   * Version of agent running on the Host
   */
  private AgentVersion agentVersion;

  /**
   * Host Health Status
   */
  private HostHealthStatus healthStatus;

  private static final StateMachineFactory
    <HostImpl, HostState, HostEventType, HostEvent>
      stateMachineFactory
        = new StateMachineFactory<HostImpl, HostState, HostEventType, HostEvent>
        (HostState.INIT)

   // define the state machine of a Host

   // Transition from INIT state
   // when the initial registration request is received
   .addTransition(HostState.INIT, HostState.WAITING_FOR_VERIFICATION,
       HostEventType.HOST_REGISTRATION_REQUEST, new HostRegistrationReceived())

   // Transition from WAITING_FOR_VERIFICATION state
   // when the host is authenticated
   .addTransition(HostState.WAITING_FOR_VERIFICATION, HostState.VERIFIED,
       HostEventType.HOST_VERIFIED, new HostVerifiedTransition())

   // Transitions from VERIFIED state
   // when a normal heartbeat is received
   .addTransition(HostState.VERIFIED, HostState.HEALTHY,
       HostEventType.HOST_HEARTBEAT_HEALTHY,
       new HostBecameHealthyTransition())
   // when a heartbeat is not received within the configured timeout period
   .addTransition(HostState.VERIFIED, HostState.HEARTBEAT_LOST,
       HostEventType.HOST_HEARTBEAT_TIMED_OUT,
       new HostHeartbeatTimedOutTransition())
   // when a heartbeart denoting host as unhealthy is received
   .addTransition(HostState.VERIFIED, HostState.UNHEALTHY,
       HostEventType.HOST_HEARTBEAT_UNHEALTHY,
       new HostBecameUnhealthyTransition())

   // Transitions from HEALTHY state
   // when a normal heartbeat is received
   .addTransition(HostState.HEALTHY, HostState.HEALTHY,
       HostEventType.HOST_HEARTBEAT_HEALTHY,
       new HostHeartbeatReceivedTransition())
   // when a heartbeat is not received within the configured timeout period
   .addTransition(HostState.HEALTHY, HostState.HEARTBEAT_LOST,
       HostEventType.HOST_HEARTBEAT_TIMED_OUT,
       new HostHeartbeatTimedOutTransition())
   // when a heartbeart denoting host as unhealthy is received
   .addTransition(HostState.HEALTHY, HostState.UNHEALTHY,
       HostEventType.HOST_HEARTBEAT_UNHEALTHY,
       new HostBecameUnhealthyTransition())

   // Transitions from UNHEALTHY state
   // when a normal heartbeat is received
   .addTransition(HostState.UNHEALTHY, HostState.HEALTHY,
       HostEventType.HOST_HEARTBEAT_HEALTHY,
       new HostBecameHealthyTransition())
   // when a heartbeart denoting host as unhealthy is received
   .addTransition(HostState.UNHEALTHY, HostState.UNHEALTHY,
       HostEventType.HOST_HEARTBEAT_UNHEALTHY,
       new HostHeartbeatReceivedTransition())
   // when a heartbeat is not received within the configured timeout period
   .addTransition(HostState.UNHEALTHY, HostState.HEARTBEAT_LOST,
       HostEventType.HOST_HEARTBEAT_TIMED_OUT,
       new HostHeartbeatTimedOutTransition())

   // Transitions from HEARTBEAT_LOST state
   // when a normal heartbeat is received
   .addTransition(HostState.HEARTBEAT_LOST, HostState.HEALTHY,
       HostEventType.HOST_HEARTBEAT_HEALTHY,
       new HostBecameHealthyTransition())
   // when a heartbeart denoting host as unhealthy is received
   .addTransition(HostState.HEARTBEAT_LOST, HostState.UNHEALTHY,
       HostEventType.HOST_HEARTBEAT_UNHEALTHY,
       new HostBecameUnhealthyTransition())
   // when a heartbeat is not received within the configured timeout period
   .addTransition(HostState.HEARTBEAT_LOST, HostState.HEARTBEAT_LOST,
       HostEventType.HOST_HEARTBEAT_TIMED_OUT)
   .installTopology();

  private final StateMachine<HostState, HostEventType, HostEvent> stateMachine;

  public HostImpl() {
    super();
    this.stateMachine = stateMachineFactory.make(this);
    ReadWriteLock rwLock = new ReentrantReadWriteLock();
    this.readLock = rwLock.readLock();
    this.writeLock = rwLock.writeLock();
    this.healthStatus = new HostHealthStatus(HealthStatus.UNKNOWN, "");
  }

  static class HostRegistrationReceived
      implements SingleArcTransition<HostImpl, HostEvent> {

    @Override
    public void transition(HostImpl host, HostEvent event) {
      HostRegistrationRequestEvent e = (HostRegistrationRequestEvent) event;
      host.importHostInfo(e.hostInfo);
      host.setLastRegistrationTime(e.registrationTime);
      host.setAgentVersion(e.agentVersion);
    }
  }

  static class HostVerifiedTransition
      implements SingleArcTransition<HostImpl, HostEvent> {

    @Override
    public void transition(HostImpl host, HostEvent event) {
      // TODO Auto-generated method stub
    }
  }

  static class HostHeartbeatReceivedTransition
    implements SingleArcTransition<HostImpl, HostEvent> {

    @Override
    public void transition(HostImpl host, HostEvent event) {
      long heartbeatTime = 0;
      switch (event.getType()) {
        case HOST_HEARTBEAT_HEALTHY:
          heartbeatTime = ((HostHealthyHeartbeatEvent)event).getHeartbeatTime();
          break;
        case HOST_HEARTBEAT_UNHEALTHY:
          heartbeatTime = ((HostUnhealthyHeartbeatEvent)event).getHeartbeatTime();
          break;
        default:
          break;
      }
      if (0 == heartbeatTime) {
        // TODO handle error
      }
      host.setLastHeartbeatTime(heartbeatTime);
    }
  }

  static class HostBecameHealthyTransition
      implements SingleArcTransition<HostImpl, HostEvent> {

    @Override
    public void transition(HostImpl host, HostEvent event) {
      HostHealthyHeartbeatEvent e = (HostHealthyHeartbeatEvent) event;
      host.setLastHeartbeatTime(e.getHeartbeatTime());
      // TODO Audit logs
      LOG.info("Host transitioned to a healthy state"
          + ", host=" + e.hostName
          + ", heartbeatTime=" + e.getHeartbeatTime());
      host.getHealthStatus().setHealthStatus(HealthStatus.HEALTHY);
    }
  }

  static class HostBecameUnhealthyTransition
      implements SingleArcTransition<HostImpl, HostEvent> {

    @Override
    public void transition(HostImpl host, HostEvent event) {
      HostUnhealthyHeartbeatEvent e = (HostUnhealthyHeartbeatEvent) event;
      host.setLastHeartbeatTime(e.getHeartbeatTime());
      // TODO Audit logs
      LOG.info("Host transitioned to an unhealthy state"
          + ", host=" + e.hostName
          + ", heartbeatTime=" + e.getHeartbeatTime()
          + ", healthStatus=" + e.getHealthStatus());
      host.setHealthStatus(e.getHealthStatus());
    }
  }

  static class HostHeartbeatTimedOutTransition
      implements SingleArcTransition<HostImpl, HostEvent> {

    @Override
    public void transition(HostImpl host, HostEvent event) {
      HostHeartbeatTimedOutEvent e = (HostHeartbeatTimedOutEvent) event;
      // TODO Audit logs
      LOG.info("Host transitioned to heartbeat timed out state"
          + ", host=" + e.hostName
          + ", lastHeartbeatTime=" + host.getLastHeartbeatTime());
      host.getHealthStatus().setHealthStatus(HealthStatus.UNKNOWN);
    }
  }

  void importHostInfo(HostInfo hostInfo) {
    try {
      writeLock.lock();
      this.hostName = hostInfo.getHostName();
      this.availableMemBytes = hostInfo.getFreeMemory();
      this.totalMemBytes = hostInfo.getMemoryTotal();
      this.cpuCount = hostInfo.getProcessorCount();
      this.osArch = hostInfo.getArchitecture();
      this.osType = hostInfo.getOS();
      this.disksInfo = hostInfo.getMounts();
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public HostState getState() {
    try {
      readLock.lock();
      return stateMachine.getCurrentState();
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setState(HostState state) {
    try {
      writeLock.lock();
      stateMachine.setCurrentState(state);
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public void handleEvent(HostEvent event)
      throws InvalidStateTransitonException {
    if (LOG.isDebugEnabled()) {
      LOG.debug("Handling Host event, eventType=" + event.getType().name()
          + ", event=" + event.toString());
    }
    HostState oldState = getState();
    try {
      writeLock.lock();
      try {
        stateMachine.doTransition(event.getType(), event);
      } catch (InvalidStateTransitonException e) {
        LOG.error("Can't handle Host event at current state"
            + ", host=" + this.getHostName()
            + ", currentState=" + oldState
            + ", eventType=" + event.getType()
            + ", event=" + event);
        throw e;
      }
    }
    finally {
      writeLock.unlock();
    }
    if (oldState != getState()) {
      if (LOG.isDebugEnabled()) {
        LOG.debug("Host transitioned to a new state"
            + ", host=" + this.getHostName()
            + ", oldState=" + oldState
            + ", currentState=" + getState()
            + ", eventType=" + event.getType().name()
            + ", event=" + event);
      }
    }
  }

  @Override
  public String getHostName() {
    try {
      readLock.lock();
      return hostName;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setHostName(String hostName) {
    try {
      writeLock.lock();
      this.hostName = hostName;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public String getIPv4() {
    try {
      readLock.lock();
      return ipv4;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setIPv4(String ip) {
    try {
      writeLock.lock();
      this.ipv4 = ip;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public String getIPv6() {
    try {
      readLock.lock();
      return ipv6;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setIPv6(String ip) {
    try {
      writeLock.lock();
      this.ipv6 = ip;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public int getCpuCount() {
    try {
      readLock.lock();
      return cpuCount;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setCpuCount(int cpuCount) {
    try {
      writeLock.lock();
      this.cpuCount = cpuCount;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public long getTotalMemBytes() {
    try {
      readLock.lock();
      return totalMemBytes;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setTotalMemBytes(long totalMemBytes) {
    try {
      writeLock.lock();
      this.totalMemBytes = totalMemBytes;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public long getAvailableMemBytes() {
    try {
      readLock.lock();
      return availableMemBytes;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setAvailableMemBytes(long availableMemBytes) {
    try {
      writeLock.lock();
      this.availableMemBytes = availableMemBytes;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public String getOsArch() {
    try {
      readLock.lock();
      return osArch;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setOsArch(String osArch) {
    try {
      writeLock.lock();
      this.osArch = osArch;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public String getOsInfo() {
    try {
      readLock.lock();
      return osInfo;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setOsInfo(String osInfo) {
    try {
      writeLock.lock();
      this.osInfo = osInfo;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public String getOsType() {
    try {
      readLock.lock();
      return osType;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setOsType(String osType) {
    try {
      writeLock.lock();
      this.osType = osType;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public List<DiskInfo> getDisksInfo() {
    try {
      readLock.lock();
      return Collections.unmodifiableList(disksInfo);
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setDisksInfo(List<DiskInfo> disksInfo) {
    try {
      writeLock.lock();
      this.disksInfo = disksInfo;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public HostHealthStatus getHealthStatus() {
    try {
      readLock.lock();
      return healthStatus;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setHealthStatus(HostHealthStatus healthStatus) {
    try {
      writeLock.lock();
      this.healthStatus = healthStatus;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public Map<String, String> getHostAttributes() {
    try {
      readLock.lock();
      return Collections.unmodifiableMap(hostAttributes);
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setHostAttributes(Map<String, String> hostAttributes) {
    try {
      writeLock.lock();
      this.hostAttributes = hostAttributes;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public String getRackInfo() {
    try {
      readLock.lock();
      return rackInfo;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setRackInfo(String rackInfo) {
    try {
      writeLock.lock();
      this.rackInfo = rackInfo;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public long getLastRegistrationTime() {
    try {
      readLock.lock();
      return lastRegistrationTime;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setLastRegistrationTime(long lastRegistrationTime) {
    try {
      writeLock.lock();
      this.lastRegistrationTime = lastRegistrationTime;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public long getLastHeartbeatTime() {
    try {
      readLock.lock();
      return lastHeartbeatTime;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setLastHeartbeatTime(long lastHeartbeatTime) {
    try {
      writeLock.lock();
      this.lastHeartbeatTime = lastHeartbeatTime;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public AgentVersion getAgentVersion() {
    try {
      readLock.lock();
      return agentVersion;
    }
    finally {
      readLock.unlock();
    }
  }

  @Override
  public void setAgentVersion(AgentVersion agentVersion) {
    try {
      writeLock.lock();
      this.agentVersion = agentVersion;
    }
    finally {
      writeLock.unlock();
    }
  }

  @Override
  public List<Job> getJobs() {
    // TODO Auto-generated method stub
    return null;
  }

}