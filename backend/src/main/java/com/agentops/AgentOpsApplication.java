package com.agentops;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class AgentOpsApplication {

  public static void main(String[] args) {
    SpringApplication.run(AgentOpsApplication.class, args);
  }
}
