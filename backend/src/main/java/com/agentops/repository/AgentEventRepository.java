package com.agentops.repository;

import com.agentops.model.AgentEvent;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AgentEventRepository extends JpaRepository<AgentEvent, Long> {
  boolean existsByUid(String uid);
  java.util.Optional<AgentEvent> findByUid(String uid);
  java.util.List<AgentEvent> findTop500ByIdGreaterThanOrderByIdAsc(Long id);
  @org.springframework.data.jpa.repository.Modifying
  @org.springframework.transaction.annotation.Transactional
  @org.springframework.data.jpa.repository.Query("delete from AgentEvent e where e.ts < :cutoff")
  int deleteOlderThan(@org.springframework.data.repository.query.Param("cutoff") String cutoff);
}
